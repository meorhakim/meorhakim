import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class TermsTranslatorService {
  constructor() {}

  public timelineTranslator(table: string, action: string, args: any) {
    switch (table) {
      case 'TerminalTransactionTimeline':
        if (action === 'add') {
          return 'Charger Selected'
        } else if (action === 'edit' && args.data.status) {
          if (args.data.status === 'PREAUTH_SUCCESS') {
            return 'Payment Authorisation'
          } else if (args.data.status === 'REMOTE_SUCCESS') {
            return 'Charger Initiated'
          } else if (args.data.status === 'SALE_CANCEL') {
            return 'Stop Charging'
          } else if (args.data.status === 'SALE_COMPLETION_REQUEST') {
            return 'Finalise Payment'
          } else if (args.data.status === 'SALE_COMPLETION_SUCCESS') {
            return 'Payment Confirmed'
          }
        } else if (action === 'edit' && args.data.extTransactionStatus) {
          return args.data.extTransactionStatus
        }
    }
    return ''
  }
}
