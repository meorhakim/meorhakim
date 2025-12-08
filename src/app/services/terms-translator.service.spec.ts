import { TestBed } from '@angular/core/testing'

import { TermsTranslatorService } from './terms-translator.service'

describe('TermsTranslatorService', () => {
  let service: TermsTranslatorService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(TermsTranslatorService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })
})
