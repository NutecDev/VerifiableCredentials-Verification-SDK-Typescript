/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import TestSetup from './TestSetup';
import { VerifiablePresentationValidation } from '../lib/InputValidation/VerifiablePresentationValidation';
import { IssuanceHelpers } from './IssuanceHelpers';
import ClaimToken, { TokenType } from '../lib/VerifiableCredential/ClaimToken';

 describe('VerifiablePresentationValidation', () => {
  let setup: TestSetup;
  const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
  beforeEach(async () => {
    setup = new TestSetup();
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  
  afterEach(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  it('should test validate', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, 'vp');   
    let validator = new VerifiablePresentationValidation(options);
    let response = await validator.validate(siop.vp, setup.defaultUserDid, setup.AUDIENCE);
    expect(response.result).toBeTruthy();

    // Negative cases
    response = await validator.validate(siop.vp, 'abcdef', setup.AUDIENCE);
    expect(response.result).toBeFalsy();
    expect(response.status).toEqual(403);
    expect(response.detailedError).toEqual('The DID used for the SIOP abcdef is not equal to the DID used for the verifiable presentation did:test:user');

    // Bad VP signature
    response = await validator.validate(new ClaimToken(TokenType.verifiablePresentation, siop.vp.rawToken + 'a', siop.vp.configuration), setup.defaultUserDid, setup.AUDIENCE);
    expect(response.result).toBeFalsy();
    expect(response.status).toEqual(403);
    expect(response.detailedError).toEqual('The signature on the payload in the vp is invalid');
  });
 });