/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import base64url from 'base64url';
import VerifiableCredentialConstants from './VerifiableCredentialConstants';
import { PresentationDefinitionModel } from '..';
const jp = require('jsonpath');

/**
 * Enum for define the token type
 */
export enum TokenType {
  /**
   * Token is self issued
   */
  selfIssued = 'selfIssued',

  /**
   * Token is id token
   */
  idToken = 'idToken',

  /**
   * Token is SIOP token issuance request
   */
  siopIssuance = 'siopIssuance',

  /**
   * Token is SIOP token presentation request with attestation presentation protocol
   */
  siopPresentationAttestation = 'siopPresentationAttestation',

  /**
   * Token is SIOP token presentation request with presentation exchange protocol
   */
  siopPresentationExchange = 'siopPresentationExchange',

  /**
   * Token is verifiable presentation
   */
  verifiablePresentation = 'verifiablePresentation',

  /**
   * Token is verifiable credential
   */
  verifiableCredential = 'verifiableCredential',

  /**
   * Token is verifiable credential
   */
  verifiablePresentationStatus = 'verifiablePresentationStatus',
}

/**
 * Model for the claim token in compact format
 */
export default class ClaimToken {
  private _configuration: string = '';
  private _rawToken: string = '';
  private _type: TokenType;
  private _decodedToken: { [key: string]: any } = {};
  private _tokenHeader: { [key: string]: any } = {};

  /**
   * Token type
   */
  public get type(): TokenType {
    return this._type;
  }

  /**
   * Token configuration endpoint
   */
  public get configuration(): string {
    return this._configuration;
  }

  /**
   * Gets the raw token
   */
  public get rawToken(): string {
    return this._rawToken;
  }

  /**
   * Gets the token header
   */
  public set rawToken(value) {
    this._rawToken = value;
  }

  /**
   * Gets the token header
   */
  public get tokenHeader(): { [key: string]: any } {
    return this._tokenHeader;
  }


  /**
   * Gets the decoded token
   */
  public get decodedToken(): { [key: string]: any } {
    return this._decodedToken;
  }

  /**
   * Create a new instance of <see @ClaimToken>
   * @param typeName Name of the token in _claimNames
   * @param token The raw token
   * @param configuration The configuration endpoint
   */
  constructor(typeName: string, token: string, configuration?: string) {
    const tokentypeValues: string[] = Object.values(TokenType);
    if (tokentypeValues.includes(typeName)) {
      this._type = typeName as TokenType;
    } else {
      throw new Error(`Type '${typeName} is not supported`);
    }

    if (typeof token === 'string') {
      this._rawToken = token as string;
      this.decode();
    }
    else {
      this._decodedToken = token;
    }

    this._configuration = configuration || '';
  }

  /**
   * Factory class to create a ClaimToken containing the token type, raw token and decoded payload
   * @param token to check for type
   */
  public static create(token: string): ClaimToken {
    // Deserialize the token
    const payload = ClaimToken.getTokenPayload(token);

    // Check type of token
    if (payload.iss === VerifiableCredentialConstants.TOKEN_SI_ISS) {
      if (payload.contract) {
        return new ClaimToken(TokenType.siopIssuance, token);
      } else if (payload.presentation_submission) {
        return new ClaimToken(TokenType.siopPresentationExchange, token);
      } else if (payload.attestations) {
        return new ClaimToken(TokenType.siopPresentationAttestation, token);
      } else {
        throw new Error(`SIOP was not recognized.`);
      }
    }

    if (payload.vc) {
      return new ClaimToken(TokenType.verifiableCredential, token);
    }
    if (payload.vp) {
      return new ClaimToken(TokenType.verifiablePresentation, token);
    }

    // Check for signature
    if (ClaimToken.tokenSignature(token)) {
      return new ClaimToken(TokenType.idToken, token);
    }

    return new ClaimToken(TokenType.selfIssued, token);
  }

  /**
  * Attestations contain the tokens and VCs in the input.
  * This algorithm will convert the attestations to a ClaimToken
  * @param attestations All presented claims
  */
  public static getClaimTokensFromAttestations(attestations: { [key: string]: string }): { [key: string]: ClaimToken } {
    const decodedTokens: { [key: string]: ClaimToken } = {};

    for (let key in attestations) {
      const token: any = attestations[key];

      if (key === VerifiableCredentialConstants.CLAIMS_SELFISSUED) {
        decodedTokens[VerifiableCredentialConstants.CLAIMS_SELFISSUED] = new ClaimToken(TokenType.selfIssued, token);
      }
      else {
        for (let tokenKey in token) {
          const claimToken = ClaimToken.create(token[tokenKey]);
          decodedTokens[tokenKey] = claimToken;
        }
      }
    };
    return decodedTokens;
  }

  /**
  * Attestations contain the tokens and VCs in the input.
  * This algorithm will convert the attestations to a ClaimToken
  * @param payload The presentaiton exchange payload 
  */
  public static getClaimTokensFromPresentationExchange(payload: PresentationDefinitionModel): { [key: string]: ClaimToken } {
    const decodedTokens: { [key: string]: ClaimToken } = {};
    // Get descriptor map
    const descriptorMap: any[] = jp.query(payload, `$.presentation_submission.descriptor_map.*`);

    for (let inx = 0; inx < descriptorMap.length; inx++) {
      const item = descriptorMap[inx];
      if (item) {
        if (!item.id) {
          throw new Error(`The SIOP presentation exchange response has descriptor_map without id property`);
        } else if (item.path) {
          const tokenFinder = jp.query(payload, item.path);
          console.log(tokenFinder);
          if (tokenFinder.length == 0) {
            throw new Error(`The SIOP presentation exchange response has descriptor_map with id '${item.id}'. This path '${item.path}' did not return a token.`);
          } else if (tokenFinder.length > 1) {
            throw new Error(`The SIOP presentation exchange response has descriptor_map with id '${item.id}'. This path '${item.path}' points to multiple credentails and should only point to one credential.`);
          } else if (typeof tokenFinder[0] === 'string') {
            const foundToken = tokenFinder[0];
            const claimToken = ClaimToken.create(foundToken);
            decodedTokens[item.id] = claimToken;
          }
        } else {
          throw new Error(`The SIOP presentation exchange response has descriptor_map with id '${item.id}'. No path property found.`);
        }  
      }
    }
    return decodedTokens;
  }


  /**
  * Attestations contain the tokens and VCs in the input.
  * This algorithm will convert the attestations to a ClaimToken
  * @param payload The status response payload
  */
 public static getClaimTokensFromReceipt(payload: any): { [key: string]: ClaimToken } {
  const decodedTokens: { [key: string]: ClaimToken } = {};

  if (!payload.receipt) {
    throw new Error(`The SIOP status response has no receipt property.`);
  }

  for (let id in payload.receipt) {
    decodedTokens[id] = ClaimToken.create(payload.receipt[id]);
  }

  return decodedTokens;
}


  /**
   * Decode the token
   * @param type Claim type
   * @param values Claim value
   */
  private decode(): void {
    const parts = this.rawToken.split('.');
    if (parts.length < 2) {
      throw new Error(`Cannot decode. Invalid input token`);
    }

    this._tokenHeader = JSON.parse(base64url.decode(parts[0]));
    this._decodedToken = JSON.parse(base64url.decode(parts[1]));
  }

  /**
   * Get the token object from the self issued token
   * @param token The token to parse
   * @returns The payload object
   */
  private static getTokenPayload(token: string): any {
    // Deserialize the token
    const split = token.split('.');
    return JSON.parse(base64url.decode(split[1]));
  }

  /**
   * Get the token object from the self issued token
   * @param token The token to parse
   * @returns The payload object
   */
  private static tokenSignature(token: string): boolean {
    // Split the token
    const split = token.split('.');
    return split[2] !== undefined && split[2].trim() !== '';
  }

  /**
  * Attestations contain the tokens and VCs in the input.
  * This algorithm will convert the attestations to a ClaimToken
  * @param attestation The attestation
  */
  private static fromAttestation(attestation: string): ClaimToken {
    const token = ClaimToken.create(attestation);
    return token;
  }
}