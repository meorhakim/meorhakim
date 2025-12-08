import { Injectable } from '@angular/core'
import { ErrorPolicy, TypedDocumentNode } from '@apollo/client/core'
import { cloneDeep } from '@apollo/client/utilities'
import { Apollo, gql } from 'apollo-angular'
import { HttpLink } from 'apollo-angular/http'
import { createClient } from 'graphql-ws'

import { Router } from '@angular/router'
import { SwPush } from '@angular/service-worker'
import { jwtDecode } from 'jwt-decode'
import { LoginMethod } from '../admin/signin-page/login/login.component'
import { GraphqlService } from './graphql.service'
import { StorageService } from './storage.service'

export enum QueryType {
  MUTATION = 'mutation',
  QUERY = 'query',
  SUBSCRIPTION = 'subscription'
}
export type Credentials = {
  Authorization?: string
  'x-role-type'?: string
  'x-login-claim'?: string
}
export type SubmitGraphqlInput = {
  queryType: QueryType
  module: string
  api: string
  query?: string
  queryWithCache?: TypedDocumentNode
  credentials?: Credentials
  variables?: { [key: string]: any }
  fixedToken?: boolean
}
export type RuleInfo = { key: string; value: any; optional: any }
export type LoginInfo = {
  userName: string
  orgCode: string
  orgType: string
  orgTypeName: string
  roleType: string
  roleDisplayName: string
  ruleInfos: RuleInfo[]
  hasMfa: boolean
  outletIds: string[]
  needLoginMfa: boolean
  operatorId: string
  hasFleetAccess: boolean
}

@Injectable({
  providedIn: 'root'
})
export class CommonService {
  VAPID_PUBLIC_KEY = 'BCo8BAofuWQOcbQbIqqme0E8rUvlL_h3UQDZAiWiwctHMdKyNv1VHmfLULmS5YcBlawZUq9DRopjW4NRtcdu1QU'
  constructor(private apollo: Apollo, private httpLink: HttpLink, private db: StorageService, private router: Router, private swPush: SwPush, private graphql: GraphqlService) {}

  public async subscriptionGraphql(gqlArgs: SubmitGraphqlInput) {
    const uri = this.getModuleUri(gqlArgs.module, true)
    let credentials = {}
    if (gqlArgs?.credentials) {
      credentials = gqlArgs.credentials
    }
    const client = createClient({ url: uri, connectionParams: credentials })
    if (!gqlArgs.query) {
      const query = client.iterate({
        query: String(gqlArgs.queryWithCache),
        variables: gqlArgs.variables
      })
      return query
    } else {
      const query = client.iterate({
        query: gqlArgs.query,
        variables: gqlArgs.variables
      })
      return query
    }
  }

  public async submitGraphql(gqlArgs: SubmitGraphqlInput, forceRefresh?: boolean, softRefresh?: boolean): Promise<any> {
    let newToken = false
    if (gqlArgs.credentials?.Authorization !== null && gqlArgs.credentials?.Authorization !== undefined) {
      const context = gqlArgs.credentials.Authorization.split(' ')[0]
      let token = gqlArgs.credentials.Authorization.split(' ')[1]
      if (context === 'Bearer') {
        const currentUser: any = await this.db.getFromStorage('currentUser')
        const idRefreshToken = currentUser.message.idRefreshToken
        const userId = (jwtDecode(token) as any).userId
        if (userId !== currentUser.message.userId) {
          await this.db.clearStorage()
          this.router.navigate(['login'])
        }
        const exp = jwtDecode(token).exp
        const refreshExp = jwtDecode(idRefreshToken).exp
        const now = Date.now() / 1000
        if (exp && refreshExp && !gqlArgs.fixedToken) {
          if (now > exp - 3 * 60 || forceRefresh) {
            if (now < refreshExp || forceRefresh) {
              const response = await this.refreshIdToken(idRefreshToken)
              if (response) {
                const currentUser: any = await this.db.getFromStorage('currentUser')
                gqlArgs.credentials.Authorization = 'Bearer ' + currentUser.message.idToken
                token = currentUser.message.idToken
                newToken = true
              }
            } else {
              await this.db.clearStorage()
              this.router.navigate(['login'])
            }
          }
        } else if (exp && !refreshExp) {
          if (now > exp - 3 * 60) {
            await this.db.clearStorage()
            this.router.navigate(['login'])
          }
        }
      }
    }
    const uri = this.getModuleUri(gqlArgs.module)
    newToken = uri.includes('identity')
    const query: any = {}
    this.debugLog(gqlArgs.query)
    if (gqlArgs.variables) {
      this.debugLog(JSON.stringify(gqlArgs.variables))
    }
    const errorPolicy: ErrorPolicy = 'all'
    query[gqlArgs.queryType] = gql`
      ${gqlArgs.query}
    `
    query.variables = gqlArgs.variables
    query['errorPolicy'] = errorPolicy
    const apollo = this.graphql.registerClient(uri, gqlArgs.credentials as Credentials, newToken || softRefresh)
    let returnData: any
    switch (gqlArgs.queryType) {
      case QueryType.QUERY:
        return new Promise(async (resolve, reject) => {
          const queryRef = apollo.watchQuery({ query: query[gqlArgs.queryType], variables: gqlArgs.variables || undefined, fetchPolicy: 'cache-and-network' })
          queryRef
            .result()
            .then((data: any) => {
              returnData = this.gqlResponseHandling(data, gqlArgs.api)
              if (returnData === undefined) {
                resolve({ error: 1, message: 'Success with no response' })
              } else {
                if (['Token invalidated'].includes(returnData.message)) {
                  alert(returnData.message)
                  this.db.clearStorage().then(() => {
                    this.router.navigate(['login'])
                  })
                  resolve({ error: 1, message: 'Token invalidated' })
                } else {
                  resolve(returnData)
                }
              }
            })
            .catch((error: any) => {
              this.gqlErrorHandling(9998, error)
            })
        })
      case QueryType.MUTATION:
        try {
          const queryRef = await apollo.mutate({ mutation: query[gqlArgs.queryType], variables: query.variables })
          return this.gqlResponseHandling(queryRef, gqlArgs.api)
        } catch (error) {
          this.gqlErrorHandling(9998, error)
        }
    }
  }

  public async login(phoneNumber: string, otp: string, type: LoginMethod): Promise</*haveto*/ any> {
    const loginClaim = btoa(`${phoneNumber}:${otp}`)
    const readLoginInfoResponse = await this.readLoginInfo(loginClaim, type)
    if (readLoginInfoResponse.length) {
      return readLoginInfoResponse
    } else {
      return false
    }
  }

  public async unsubscribeBackendNotification() {
    if (this.swPush.isEnabled) {
      await this.swPush.unsubscribe()
    }
    return
  }

  public async subscribeBackendNotification() {
    let actualSub: any = {}
    if (this.getEnv() === 'dev') {
      this.VAPID_PUBLIC_KEY = 'BK9YlVBy6Cf7wvrea1xSjkuJtaFF3SDh_ZGPwsuxNGuTkbt1odg1N_MEtiXDxbYYvkmiY3qHamKbFJaQK8VupYM'
    } else if (this.getEnv() === 'uat') {
      this.VAPID_PUBLIC_KEY = 'BB-4IY4iOzdkRG8FmyHKdgzwOsOQCut6yrhlClFsKnIw4gx4WGU9b96YMVxO1TDSVrul5jv4LZJsGvpYy2sFtG8'
    } else {
      this.VAPID_PUBLIC_KEY = 'BCo8BAofuWQOcbQbIqqme0E8rUvlL_h3UQDZAiWiwctHMdKyNv1VHmfLULmS5YcBlawZUq9DRopjW4NRtcdu1QU'
    }
    if (this.swPush.isEnabled) {
      this.swPush.requestSubscription({ serverPublicKey: this.VAPID_PUBLIC_KEY }).then(async (sub) => {
        actualSub = JSON.parse(JSON.stringify(sub))
        await this.db.setToStorage('notificationCredentials', actualSub)
        const currentUser: any = await this.db.getFromStorage('currentUser')
        const roleType: any = await this.db.getFromStorage('role')
        const queryType = QueryType.MUTATION
        const api = 'registerNotificationRecipient'
        const module = 'messenger-admin'
        const query = `mutation JuiceUp { registerNotificationRecipient ( data: { auth: "${actualSub.keys.auth}", domain: "ev-admin-portal", endpoint: "${actualSub.endpoint}", p256dh: "${actualSub.keys.p256dh}" } ) { id } }`
        const credentials: Credentials = {
          Authorization: `Bearer ${currentUser.message.idToken}`,
          'x-role-type': roleType.message.roleType
        }
        const gqlArgs: SubmitGraphqlInput = {
          queryType,
          module,
          api,
          query,
          credentials
        }
        this.debugLog(gqlArgs)
        const response = await this.submitGraphql(gqlArgs)
      })
    } else {
      return
    }
  }

  public async transformIdToken(loginClaim: string, readLoginInfoResponse: any, type: LoginMethod, mfaCode?: number) {
    const queryType = QueryType.QUERY
    const module = 'identity'
    const api = 'transformIdToken'
    let dataString = ''
    if (this.getEnv() !== 'uat') {
      dataString = '( data: { portalLogin: true } )'
    }
    const query = `query JuiceUp { transformIdToken ${dataString} { userId, idToken, idRefreshToken } }`
    let credentials: any
    if (type === LoginMethod.OTP) {
      credentials = { 'x-login-claim': loginClaim }
    } else if (type === LoginMethod.PASSWORD) {
      credentials = { Authorization: `Basic ${loginClaim}` }
    }
    if (mfaCode !== undefined && mfaCode !== null) {
      credentials['x-metadata'] = JSON.stringify({
        mfa: { challenges: [{ type: 'TOTP', token: mfaCode.toString() }] }
      })
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    if (response.error === 0 && response?.message?.data?.transformIdToken !== null) {
      if (readLoginInfoResponse.length === 1) {
        await this.db.setToStorage('role', readLoginInfoResponse[0])
      }
      await this.db.setToStorage('currentUser', {
        userId: response.message.data.transformIdToken.userId,
        idToken: response.message.data.transformIdToken.idToken,
        idRefreshToken: response.message.data.transformIdToken.idRefreshToken
      })
      this.operatorMerchantMapping(readLoginInfoResponse[0], response.message.data.transformIdToken.idToken)
      return true
    } else {
      throw new Error(JSON.stringify(response.error))
    }
  }

  public async refreshIdToken(refreshToken: string) {
    const queryType = QueryType.QUERY
    const module = 'identity'
    const api = 'refreshIdToken'
    const query = `query JuiceUp { refreshIdToken { idToken, userId, idRefreshToken } }`
    const credentials: Credentials = {
      Authorization: `Bearer ${refreshToken}`
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    if (response.error === 0 && response?.message?.data?.transformIdToken !== null) {
      await this.db.setToStorage('currentUser', {
        userId: response.message.data.refreshIdToken.userId,
        idToken: response.message.data.refreshIdToken.idToken,
        idRefreshToken: response.message.data.refreshIdToken.idRefreshToken
      })
      return true
    } else {
      throw new Error(JSON.stringify(response.error))
    }
  }

  private async readLoginInfo(loginClaim: string, type: LoginMethod) {
    const queryType = QueryType.QUERY
    const module = 'identity'
    const api = 'readLoginInfo'
    // const query = `query JuiceUp { readLoginInfo { info { mfa { login, totp }, displayName, groups { outletIds, roleGroup { id, code, displayName, roles { id, code, rules, displayName, metadata, product { id, code, appDomain, org { id, code, type, displayName } } }, org { id, code, type, displayName } } } } } }`
    const query = `query JuiceUp { readLoginInfo { info { mfa { login, totp }, displayName, groups { roleGroup { id, code, displayName, roles { id, code, rules, displayName, product { id, code, appDomain, org { id, code, type, displayName } } }, org { id, code, type, displayName } } } } } }`
    let credentials
    if (type === LoginMethod.OTP) {
      credentials = { 'x-login-claim': loginClaim }
    } else if (type === LoginMethod.PASSWORD) {
      credentials = { Authorization: `Basic ${loginClaim}` }
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    if (response.message.data[api].info.mfa.totp) {
      await this.db.setToStorage('totp', true)
    }
    const loginInfos: LoginInfo[] = []
    if (response.error === 0 && response?.message?.data?.readLoginInfo !== null) {
      await this.db.setToStorage('userName', response.message.data.readLoginInfo.info.displayName)
      for (const roleGroup of response.message.data.readLoginInfo.info.groups) {
        let operatorId = ''
        const ruleInfos: RuleInfo[] = []
        for (const role of roleGroup.roleGroup.roles) {
          operatorId === '' && role.metadata?.attributes?.operatorId ? (operatorId = role.metadata.attributes.operatorId) : {}
          for (const rule of role.rules) {
            if (rule?.conditions?.mfa !== undefined && rule?.conditions?.mfa !== null) {
              for (const challenge of rule.conditions.mfa.challenges) {
                const ruleInfo: RuleInfo = {
                  key: rule.action + rule.subject,
                  value: challenge.type,
                  optional: challenge.optional
                }
                ruleInfos.push(ruleInfo)
              }
            }
          }
        }
        let orgType: string = ''
        let orgTypeName: string = ''
        if (roleGroup.roleGroup.org.type === null) {
          orgType = orgTypeName = 'PAIDChain'
        } else {
          orgType = roleGroup.roleGroup.org.type
          orgTypeName = roleGroup.roleGroup.org.type
          if (roleGroup.roleGroup.org.displayName.split('-').length === 3) {
            orgTypeName = roleGroup.roleGroup.org.displayName.split('-')[2].trim()
          }
        }
        const loginInfo: LoginInfo = {
          userName: response.message.data.readLoginInfo.info.displayName,
          hasMfa: response.message.data.readLoginInfo.info.mfa.totp,
          needLoginMfa: response.message.data.readLoginInfo.info.mfa.totp,
          orgCode: roleGroup.roleGroup.org.code,
          orgType,
          orgTypeName: orgTypeName,
          roleType: roleGroup.roleGroup.code,
          roleDisplayName: roleGroup.roleGroup.displayName,
          outletIds: roleGroup.outletIds,
          ruleInfos,
          operatorId,
          hasFleetAccess: roleGroup.roleGroup.roles.find((x: any) => x.code.includes('FLEET_ADMIN_API')) ? true : false
        }
        if (loginInfo.roleDisplayName !== 'Applicant' && loginInfo.orgType === 'CPO') {
          loginInfos.push(loginInfo)
        }
      }
      if (loginInfos.length > 1) {
        await this.db.setToStorage('availableRoles', loginInfos)
        return loginInfos
      } else if (loginInfos.length) {
        await this.db.setToStorage('availableRoles', loginInfos)
        await this.db.setToStorage('role', loginInfos[0])
        return loginInfos
      } else {
        throw new Error('No login credential')
      }
    }
    throw new Error(JSON.stringify(response.error))
  }

  async readRoleGroup(loginInfo: LoginInfo, token: string) {
    const api = 'readRoleGroup'
    const queryType = QueryType.QUERY
    const module = 'identity'
    const query = `query JuiceUp { readRoleGroup ( where: { code: "${loginInfo.roleType}" } ) { id, roles { metadata } } }`
    const credentials: Credentials = {
      Authorization: `Bearer ${token}`,
      'x-role-type': loginInfo.roleType
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    for (const role of response.message.data[api].roles) {
      if (role.metadata?.attributes?.operatorId) {
        await this.db.setToStorage('operatorId', role.metadata.attributes.operatorId)
        return role.metadata.attributes.operatorId
      }
    }
  }

  async browseTerminalConfig(loginInfo: LoginInfo, token: string) {
    const merchantId: any[] = []
    const where: any = {}
    const roleResponse: any = await this.db.getFromStorage('role')
    let outletIdString = ''
    if (roleResponse.message.outletIds?.length) {
      outletIdString = `where: { status: { equals: READY }, Location: { is: { id: { in: ${JSON.stringify(roleResponse.message.outletIds)} } } } }, `
      // where['outletId'] = { in: JSON.stringify(roleResponse.message.outletIds) }
    }
    if (this.getEnv() === 'uat') {
      merchantId.push('000001920200555')
    }
    if (loginInfo.roleType.split('|').slice(-1)[0].toLowerCase() === 'monitor') {
      const userName = loginInfo.userName
      const mids: any = {
        '@artech': '000001240107771',
        '@artemk': '000001240107821',
        '@mercurehotel': '000001240103697',
        '@conceptmelaka': '000001240103747'
      }
      for (const mid of Object.keys(mids)) {
        if (userName.includes(mid)) {
          merchantId.push(mids[mid])
        }
      }
    }
    let merchantIdString = ''
    if (loginInfo.roleType.split('|').slice(-1)[0].toLowerCase() === 'monitor' && merchantId.length) {
      where['merchantId'] = { in: JSON.stringify(merchantId) }
    }
    // const role: any = await this.db.getFromStorage('role')
    // if(role.message.outletIds?.length) {
    //   where ['']
    // }
    const api = 'browseTerminalConfig'
    const queryType = QueryType.QUERY
    const module = 'tc-admin_v2'
    const query = `query JuiceUp { browseTerminalConfig ( ${outletIdString} pagination: { pageSize: 0 }, distinct: [merchantId] ) { items { merchantId, ocppServer, operatorId, Location { name } } } }`
    const credentials: Credentials = {
      Authorization: `Bearer ${token}`,
      'x-role-type': loginInfo.roleType
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    return response.message.data[api].items
  }

  async browseChargePointOperator(loginInfo: LoginInfo, token: string) {
    const api = 'browseChargePointOperator'
    const queryType = QueryType.QUERY
    const module = 'operator-admin'
    const query = `query JuiceUp { browseChargePointOperator { items { id } } }`
    const credentials: Credentials = {
      Authorization: `Bearer ${token}`,
      'x-role-type': loginInfo.roleType
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    return response.message.data[api].items
  }

  async browseAccountProfile(terminalConfigs: any, token: string, roleType: string) {
    const mid = []
    for (const tc of terminalConfigs) {
      if (tc.merchantId) {
        mid.push(tc.merchantId)
      }
    }
    const api = 'browseAccountProfile'
    const queryType = QueryType.QUERY
    const module = 'metadata'
    const query = `query JuiceUp { browseAccountProfile ( where: { mid: { in: ${JSON.stringify(mid)} } }, pagination: { pageSize: 0 } ) { items { mid, merchantName, acquirerId } } }`
    const credentials: Credentials = {
      Authorization: `Bearer ${token}`,
      'x-role-type': roleType
    }
    const gqlArgs: SubmitGraphqlInput = {
      queryType,
      module,
      api,
      query,
      credentials
    }
    const response = await this.submitGraphql(gqlArgs)
    return response.message.data[api].items
  }

  async operatorMerchantMapping(loginInfo: LoginInfo, token: string) {
    const operatorId = await this.readRoleGroup(loginInfo, token)
    if (operatorId) {
      const tcResponse = await this.browseTerminalConfig(loginInfo, token)
      const accountProfileResponse = await this.browseAccountProfile(tcResponse, token, loginInfo.roleType)
      const merchants = []
      let id = 1
      for (const tc of tcResponse) {
        const merchant = accountProfileResponse.filter((x: any) => x.mid === tc.merchantId)
        const acquirerIds = []
        for (const m of merchant) {
          acquirerIds.push(m.acquirerId)
        }
        if (merchant.length) {
          merchants.push({
            id: id,
            mid: tc.merchantId,
            operatorId: tc.operatorId,
            merchantName: merchant[0].merchantName,
            locationName: tc.Location.name,
            ocppServer: tc.ocppServer,
            acquirerIds: acquirerIds
          })
          id += 1
        }
      }
      if (merchants.length > 1) {
        merchants.sort((a, b) => {
          if (!a?.locationName) {
            return 0
          } else if (!b?.locationName) {
            return 1
          }
          return a.locationName.toLowerCase().localeCompare(b.locationName.toLowerCase())
        })
        merchants.unshift({
          id: 0,
          mid: '0',
          operatorId: tcResponse[0].operatorId,
          merchantName: 'All Locations',
          locationName: 'All Locations',
          ocppServer: tcResponse[0].ocppServer
        })
      }
      const cleanedMerchants = merchants.map((merchant) => ({ ...merchant, acquirerIds: [...new Set(merchant.acquirerIds)] }))
      // added by shameful to remove duplicate acquirerIDs when one charge group has few terminals
      await this.db.setToStorage('availableMerchants', cleanedMerchants)
      await this.db.setToStorage('merchant', merchants[0])
    } else {
      throw new Error('No login credential')
    }
  }

  private gqlErrorHandling(errorCode: number, error: any = '') {
    if (error !== '') {
      this.debugLog(JSON.stringify(error))
      if (JSON.stringify(error).includes('expired')) {
        this.db.clearStorage()
        this.router.navigate(['login'])
      }
      throw { error: errorCode, message: JSON.stringify(error) }
    }
  }

  private gqlResponseHandling(data: any, api: string = '') {
    this.debugLog(data)
    if (data.data !== null && data.data !== undefined) {
      this.debugLog('Not null data')
      if (data.data[api] !== null && data.data[api] !== undefined) {
        this.debugLog('Request success')
        return { error: 0, message: data }
      } else {
        this.debugLog('Request Unsuccessful')
        if (data.errors !== null && data.errors !== undefined) {
          const { extensions, ...error } = data.errors[0]
          error['error'] = true
          return error
        }
        return { error: 0, message: 'Request Unsuccessful' }
      }
    } else {
      if (data.errors !== null && data.errors !== undefined) {
        const { extensions, ...error } = data.errors[0]
        error['error'] = true
        return error
      }
      throw { error: 1, message: 'Success with no response' }
    }
  }

  private getModuleUri(module: string, subscription: boolean = false) {
    let prefix
    if (subscription) {
      prefix = 'wss'
    } else {
      prefix = 'https'
    }
    const env = this.getEnv()
    if (env.length) {
      if (['deal', 'identity', 'receipt', 'identity-2', 'fraud-detection', 'messenger-admin', 'terminal-tracker-admin', 'wallet', 'messenger'].includes(module)) {
        return `${prefix}://rmo-api.${env}.paidchain.uk/api/${module}/graphql`
      } else if (['tc', 'tc_v2', 'ocpp-admin', 'ocpp-admin_v2', 'tc-admin_v2', 'tc-admin', 'operator-admin', 'fleet-admin', 'dlm'].includes(module)) {
        if (env === 'dev') {
          module = module.split('_')[0]
        }
        return `${prefix}://device-api.${env}.paidchain.uk/api/ev/${module}/graphql`
      } else if (['metadata'].includes(module)) {
        return `${prefix}://gtw-genesis-api.${env}.paidchain.uk/api/tx/${module}/graphql`
      } else if (['ev-analytics'].includes(module)) {
        return `${prefix}://analytics-api.ml-${env}.paidchain.uk/api/${module}/graphql`
      } else if (['billing-admin'].includes(module)) {
        return `${prefix}://rmo-api.${env}.paidchain.uk/api/cm/${module}/graphql`
      }
      return ''
    } else {
      if (['deal', 'identity', 'receipt', 'identity-2', 'fraud-detection', 'messenger-admin', 'terminal-tracker-admin', 'wallet', 'messenger'].includes(module)) {
        if (module === 'fraud-detection') {
          return `${prefix}://rmo-api.dev.paidchain.uk/api/${module}/graphql`
        }
        return `${prefix}://common-api.paidchain.my/api/${module}/graphql`
      } else if (['tc', 'tc_v2', 'ocpp-admin', 'ocpp-admin_v2', 'tc-admin_v2', 'tc-admin', 'operator-admin', 'fleet-admin', 'dlm'].includes(module)) {
        if (env === 'dev') {
          module = module.split('_')[0]
        }
        return `${prefix}://device-api.paidchain.my/api/ev/${module}/graphql`
      } else if (['metadata'].includes(module)) {
        return `${prefix}://gateway-api.paidchain.my/api/tx/${module}/graphql`
      } else if (['ev-analytics'].includes(module)) {
        return `${prefix}://analytics-api.ml.paidchain.my/api/${module}/graphql`
      }
      return ''
    }
  }

  public debugLog(...arg: any) {
    // console.log(...arg)
    if (this.getEnv().length) {
      console.log(...arg)
    } else {
      return
    }
  }

  public getEnv() {
    // return ''
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
