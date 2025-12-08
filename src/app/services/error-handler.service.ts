import { ErrorHandler, Injectable } from '@angular/core'
import StackTrace from 'stacktrace-js'
import { HttpClient } from '@angular/common/http'
// import { StorageService } from './storage.service'

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService implements ErrorHandler {
  constructor(private http: HttpClient) {}

  async handleError(error: any) {
    // const user: any = await this.db.getFromStorage('currentUser')
    // const userName: any = await this.db.getFromStorage('userName')
    const errorMessage: any = {
      // userId: user?.message?.userId || 'public',
      // userName: userName?.message || 'public',
      timestamp: new Date().toISOString(),
      domain: 'ev-admin-portal',
      agent: window.navigator.userAgent,
      message: error.message,
      errors: []
    }
    StackTrace.fromError(error)
      .then((stackFrames) => {
        for (const stackFrame of stackFrames) {
          errorMessage.errors.push({ file: stackFrame.fileName?.split('///')[1], line: stackFrame.lineNumber })
        }
      })
      .finally(() => {
        if (this.getEnv().length) {
          console.error(error)
        }
        try {
          this.postError(errorMessage)
        } catch (e) {
          console.log(e)
        }
      })
  }

  private postError(errorMessage: any) {
    this.http.post(this.getErrorLogUrl(), { body: JSON.stringify(errorMessage) }, { responseType: 'text' }).subscribe((res) => console.log(res))
  }

  private getErrorLogUrl() {
    const env = this.getEnv()
    if (env.length) {
      return `https://gtw-genesis-api.${env}.paidchain.uk/api/cm/web-log/v1/error-log`
    } else {
      return `https://gateway-api.paidchain.my/api/cm/web-log/v1/error-log`
    }
  }

  public getEnv() {
    if (!(window.location.host.includes('paidchain.my') || window.location.host.includes('juiceup.my'))) {
      if (window.location.host.includes('.dev.paidchain') || window.location.host.includes('localhost')) {
        return 'dev'
      } else {
        return 'uat'
      }
    } else {
      return ''
    }
  }
}
