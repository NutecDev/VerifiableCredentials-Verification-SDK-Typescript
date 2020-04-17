import { TSMap } from "typescript-map";
import { TokenType, ValidatorBuilder, IExpected, IdTokenTokenValidator, VerifiableCredentialTokenValidator, VerifiablePresentationTokenValidator } from '../lib/index';
import { IssuanceHelpers } from './IssuanceHelpers';
import TestSetup from './TestSetup';
import ValidationQueue from '../lib/InputValidation/ValidationQueue';
import SelfIssuedTokenValidator from '../lib/Api/selfIssuedTokenValidator';
import SiopTokenValidator from '../lib/Api/SiopTokenValidator';

describe('Validator', () => {
  let setup: TestSetup;
  beforeEach(async () => {
    setup = new TestSetup();
  });
  afterEach(async () => {
    setup.fetchMock.reset();
  });

  it ('should validate id token', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.idToken);   
    const expected: IExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.idToken)[0];

    let tokenValidator = new IdTokenTokenValidator(setup.validatorOptions, expected);
    let validator = new ValidatorBuilder()
      .useValidators(tokenValidator)
      .build();
  
    let result = await validator.validate(siop.idToken.rawToken);
    expect(result.result).toBeTruthy();tokenValidator = new IdTokenTokenValidator(setup.validatorOptions, expected);
    
    // Negative cases
    expected.issuers = ['xxx'];
    tokenValidator = new IdTokenTokenValidator(setup.validatorOptions, expected);
    validator = new ValidatorBuilder()
      .useValidators(tokenValidator)
      .build();
  
    result = await validator.validate(siop.idToken.rawToken);
    expect(result.result).toBeFalsy();
    expect(result.detailedError).toEqual(`Could not fetch token configuration`);
  });

  it ('should validate verifiable credentials', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiableCredential);   
    const expected = siop.expected.filter((token: IExpected) => token.type === TokenType.verifiableCredential)[0];

    // siop is always the id of the first element being validated
    const map = new TSMap<string, IExpected>();
    map.set('siop', expected);

    const tokenValidator = new VerifiableCredentialTokenValidator(setup.validatorOptions, map);
    const validator = new ValidatorBuilder()
      .useValidators(tokenValidator)
      .build();
  
    const result = await validator.validate(siop.vc.rawToken);
    expect(result.result).toBeTruthy();
  });

  fit ('should validate verifiable presentations', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiablePresentation);   
    const vpExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.verifiablePresentation)[0];
    const vcExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.verifiableCredential)[0];
    
    // the map gets its key from the created request
    const map = new TSMap<string, IExpected>();
    map.set(Object.keys(siop.attestations.presentations)[0], vcExpected);
    
    const vpValidator = new VerifiablePresentationTokenValidator(setup.validatorOptions, vpExpected);
    const vcValidator = new VerifiableCredentialTokenValidator(setup.validatorOptions, map);
    let validator = new ValidatorBuilder()
      .useValidators([vcValidator, vpValidator])
      .build();

    // Check validator types
    expect(vpValidator.isType).toEqual(TokenType.verifiablePresentation);
    expect(vcValidator.isType).toEqual(TokenType.verifiableCredential);

    // Check VP validator
    let queue = new ValidationQueue();
    queue.addToken('vp', siop.vp.rawToken);
    let result = await vpValidator.validate(queue, queue.getNextToken()!, setup.defaultUserDid);
    expect(result.result).toBeTruthy();
    expect(result.tokensToValidate![`vp`].rawToken).toEqual(siop.vc.rawToken);

    // Check VC validator
    queue = new ValidationQueue();
    queue.addToken('vc', siop.vc.rawToken);
    result = await vcValidator.validate(queue, queue.getNextToken()!, setup.defaultUserDid);
    expect(result.result).toBeTruthy();

    // Check validator
    queue = new ValidationQueue();
    queue.addToken('vp', siop.vp.rawToken);
    result = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(result.result).toBeTruthy();
    expect(result.validationResult?.verifiableCredentials).toBeDefined();

    // Negative cases
    // Test validator with missing VC validator
    validator = new ValidatorBuilder()
      .useValidators(vpValidator)
      .build();
    queue = new ValidationQueue();
    queue.addToken('vp', siop.vp.rawToken);
    expectAsync(validator.validate(queue.getNextToken()!.tokenToValidate)).toBeRejectedWith('verifiableCredential does not has a TokenValidator');
  });
  
  it ('should validate siop', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiablePresentation);   
    const siopExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.siop)[0];
    const vpExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.verifiablePresentation)[0];
    const vcExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.verifiableCredential)[0];
    const idTokenExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.idToken)[0];
    const siExpected = siop.expected.filter((token: IExpected) => token.type === TokenType.selfIssued)[0];

    const vpValidator = new VerifiablePresentationTokenValidator(setup.validatorOptions, vpExpected);
    const vcValidator = new VerifiableCredentialTokenValidator(setup.validatorOptions, vcExpected);
    const idTokenValidator = new IdTokenTokenValidator(setup.validatorOptions, idTokenExpected);
    const siopValidator = new SiopTokenValidator(setup.validatorOptions, siopExpected);
    const siValidator = new SelfIssuedTokenValidator(setup.validatorOptions, siExpected);

    // Check validator types
    expect(vpValidator.isType).toEqual(TokenType.verifiablePresentation);
    expect(vcValidator.isType).toEqual(TokenType.verifiableCredential);
    expect(idTokenValidator.isType).toEqual(TokenType.idToken);
    expect(siopValidator.isType).toEqual(TokenType.siop);
    expect(siValidator.isType).toEqual(TokenType.selfIssued);

    // Check siop validator
    let queue = new ValidationQueue();
    queue.addToken('siop', request.rawToken);
    let result = await siopValidator.validate(queue, queue.getNextToken()!);
    expect(result.result).toBeTruthy();
    expect(result.tokensToValidate!['VerifiableCredential'].rawToken).toEqual(siop.vp.rawToken);
    expect(result.tokensToValidate![`${setup.defaultIdTokenConfiguration}`].rawToken).toEqual(siop.idToken.rawToken);
    expect(result.tokensToValidate!['selfIssued'].rawToken).toEqual(siop.si.rawToken);

    // Check validator
    let validator = new ValidatorBuilder()
      .useValidators([vcValidator, vpValidator, idTokenValidator, siopValidator, siValidator])
      .build();
      
    queue = new ValidationQueue();
    queue.addToken('siop', request.rawToken);
    result = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(result.result).toBeTruthy();
    expect(result.status).toEqual(200);
    expect(result.detailedError).toBeUndefined();
    expect(result.tokensToValidate).toBeUndefined();
    expect(result.validationResult?.did).toEqual(setup.defaultUserDid);
    expect(result.validationResult?.idTokens).toBeDefined();
    for (let idtoken in result.validationResult?.idTokens) {
      expect(result.validationResult?.idTokens[idtoken].upn).toEqual('jules@pulpfiction.com');
    }
    expect(result.validationResult?.selfIssued).toBeDefined();
    expect(result.validationResult?.selfIssued.name).toEqual('jules');
    expect(result.validationResult?.verifiableCredentials).toBeDefined();
    expect(result.validationResult?.verifiableCredentials!['VerifiableCredential'].vc.credentialSubject.givenName).toEqual('Jules');

    // Negative cases
    
  });
});