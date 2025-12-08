import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router'

// Services
import { CommonService, Credentials, QueryType, SubmitGraphqlInput } from 'src/app/services/common.service'
import { StorageService } from 'src/app/services/storage.service'
import { EventsService } from 'src/app/services/events.service'

// Other
import { jwtDecode } from 'jwt-decode'
import { AuthGuard } from 'src/assets/shared/guard/auth.guard'

export enum LoginMethod {
  OTP = 'OTP',
  PASSWORD = 'PASSWORD'
}

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class Login implements OnInit  {
  merchantLogo: string = 'assets/images/logo/juiceup/juiceup.svg'

  constructor(private router: Router, private events: EventsService, private common: CommonService, private db: StorageService, private authGuard: AuthGuard) {
    try {
      this.events.getObservable().subscribe((data) => {
        if (data['module'] == 'close_Page') {
          this.verify = false
        }
      })
    } catch (err) {
      this.common.debugLog(err)
      //perform any action/message to handle when error occur
    }
  }

  mobileview: boolean = false
  phoneNumber: string = ''
  userName: string = ''
  password: string = ''
  inptypeClass: string = 'form-control'
  inpPWClass: string = 'form-control'
  loginMethod: LoginMethod = LoginMethod.PASSWORD
  last4digits: string = ''
  verify: boolean = false
  mfa_verify: boolean = false

  async ngOnInit() {
    if (window.innerWidth < 992) {
      this.mobileview = true
    }
    const currentUser: any = await this.db.getFromStorage('currentUser')
    const roleType: any = await this.db.getFromStorage('role')
    if (currentUser.message === null) {
      this.router.navigate(['login'])
    } else {
      const idToken = currentUser.message.idToken
      const idRefreshToken = currentUser.message.idRefreshToken
      const now = Date.now() / 1000
      const exp = jwtDecode(idToken).exp
      const refreshExp = jwtDecode(idRefreshToken).exp
      if (exp !== undefined && refreshExp !== undefined) {
        if (now < exp - 3 * 60) {
          if (this.router.url.includes('login')) {
            const url = await this.authGuard.redirect(roleType.message.roleType)
            this.router.navigate([url])
          } else {
            this.router.navigate([this.router.url])
          }
        } else if (now < refreshExp) {
          const response = await this.common.refreshIdToken(idRefreshToken)
          if (response) {
            window.location.reload()
          }
        } else {
          await this.db.clearStorage()
          this.router.navigate(['login'])
        }
      }
    }
  }

  formatPhoneNumber() {
    if ((this.phoneNumber.length === 10 && this.phoneNumber.startsWith('01')) || (this.phoneNumber.length === 11 && this.phoneNumber.startsWith('01'))) {
      this.phoneNumber = '+6' + this.phoneNumber
      this.last4digits = this.phoneNumber.substring(this.phoneNumber.length - 4, this.phoneNumber.length)
      this.checkLoginMethod()
    } else if ((this.phoneNumber.length === 11 || this.phoneNumber.length === 12) && this.phoneNumber.startsWith('601')) {
      this.phoneNumber = '+' + this.phoneNumber
      this.last4digits = this.phoneNumber.substring(this.phoneNumber.length - 4, this.phoneNumber.length)
      this.checkLoginMethod()
    } else if ((this.phoneNumber.length === 12 || this.phoneNumber.length === 13) && this.phoneNumber.startsWith('+601')) {
      this.last4digits = this.phoneNumber.substring(this.phoneNumber.length - 4, this.phoneNumber.length)
      this.checkLoginMethod()
    } else {
      this.inptypeClass = 'form-control typewarn'
      this.phoneNumber = ''
      setTimeout(function () {
        alert('Fill out your phone number correctly!')
      }, 100)
    }
  }

  async checkLoginMethod() {
    if (false) {
      this.loginMethod = LoginMethod.OTP
      // this.verifyNone = false
    } else {
      this.loginMethod = LoginMethod.PASSWORD
      // this.verifyNone = false
    }
  }

  formatPassword() {
    if ((this.password = '')) {
      this.inpPWClass = 'form-control typewarn'
      setTimeout(function () {
        alert('Fill out your phone number correctly!')
      }, 100)
    } else {
    }
  }

  insertPhoneNumber(event: any, phoneNumber: any) {
    this.inptypeClass = 'form-control'
    this.phoneNumber = phoneNumber.value
    if (event.code !== 'Enter' && this.phoneNumber.length) {
      this.formatPhoneNumber()
    }
  }

  insertUserName(event: any, userName: any) {
    this.inptypeClass = 'form-control'
    this.userName = userName.value
  }

  insertPassword(event: any, passwordkeyin: any) {
    this.inpPWClass = 'form-control'
    this.password = passwordkeyin.value
  }

  async gotoPage(event: any, page: string) {
    if (event.type === 'keypress') {
      if (event.keyCode === 13) {
        this.password = event.target.value
      } else {
        return
      }
    }
    if (page == 'home') {
      if (this.loginMethod === LoginMethod.OTP) {
        this.verify = true
        try {
          await this.requestLoginClaim()
        } catch (e) {
          this.common.debugLog(e)
        }
      } else {
        const response = await this.common.login(this.phoneLogin ? this.phoneNumber : this.userName, this.password, this.loginMethod)
        let transformIdTokenResponse: any = undefined
        if (response.length) {
          const mfaNeeded: any = await this.db.getFromStorage('totp')
          const loginClaim = btoa(`${this.phoneLogin ? this.phoneNumber : this.userName}:${this.password}`)
          let mfaCode = ''
          if (mfaNeeded.message) {
            this.mfa_verify = true
            try {
              this.events.getObservable().subscribe(async (data) => {
                if (data.module === 'mfaCode') {
                  mfaCode = data.data
                  transformIdTokenResponse = await this.common.transformIdToken(loginClaim, response, LoginMethod.PASSWORD, parseInt(mfaCode))
                  this.mfa_verify = false
                }
              })
            } catch (e) {
              this.common.debugLog(e)
            }
          } else {
            transformIdTokenResponse = await this.common.transformIdToken(loginClaim, response, LoginMethod.PASSWORD)
          }
        }
        let loginCounter = 0
        const loginTimeout = setInterval(async () => {
          loginCounter += 1
          if (transformIdTokenResponse && response.length === 1) {
            await this.common.subscribeBackendNotification()
            clearInterval(loginTimeout)
            this.router.navigate([page])
          } else if (transformIdTokenResponse && response) {
            let counter = 0
            const timeout = setInterval(async () => {
              counter += 1
              const response: any = await this.db.getFromStorage('role')
              if (response.message) {
                await this.common.subscribeBackendNotification()
                clearInterval(loginTimeout)
                clearInterval(timeout)
                this.router.navigate([page])
              } else if (counter === 120) {
                this.db.clearStorage()
                clearInterval(loginTimeout)
                clearInterval(timeout)
                this.router.navigate(['login'])
              }
            }, 1000)
            this.router.navigate(['cpo-menu'])
          } else if (loginCounter === 120) {
            clearInterval(loginCounter)
          }
        }, 1000)
      }
    }
  }

  async requestLoginClaim(): Promise<any> {
    await this.db.clearStorage()
    const queryType = QueryType.QUERY
    const module = 'identity'
    const api = 'requestLoginClaim'
    const query = `query JuiceUp {
            requestLoginClaim(data: {login: "${this.phoneNumber}"})
        }`
    const gqlArgs: SubmitGraphqlInput = { queryType, module, api, query }
    const response = await this.common.submitGraphql(gqlArgs)
    return
  }

  translate: string = '0'
  phoneLogin: boolean = true
  buttonA: string = 'green'
  buttonB: string = ''
  loginChoice(event: any) {
    this.userName = ''
    this.password = ''
    this.phoneNumber = ''
    if (event.target.textContent === 'Phone Number') {
      this.phoneLogin = true
      this.buttonA = 'green'
      this.buttonB = ''
      this.translate = '0'
    } else {
      this.phoneLogin = false
      this.loginMethod = LoginMethod.PASSWORD
      this.buttonA = ''
      this.buttonB = 'green'
      this.translate = '150px'
    }
  }
}
