import { Injectable } from '@angular/core'
import { ActivatedRoute, ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router'
import { cloneDeep } from 'lodash'
import { StorageService } from 'src/app/services/storage.service'

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(public router: Router, public db: StorageService, private route: ActivatedRoute) {}

  financePath = [
    'sales',
    'transaction',
    'settlement',
    'billing',
    'reward',
    'payment',
    'txdetail/:txCode',
    'transaction/:batchCode',
    'edit-reward',
    'choose-template',
    'reward/:action',
    'reward/:action/:rewardId',
    'billing-home',
    'billing-dividend',
    'billing-dividend-details',
    'billing-dividend-creation',
    'billing-sales',
    'billing-payout',
    'billing-ledger',
    'billing-cashback',
    'billing-option',
    'billing-plans',
    'billing-plan-details',
    'billing-plan-creation',
    'billing-merchant-plan',
    'billing-edit-merchant-plan',
    'notifications'
  ]

  operationOnUsPath = [
    'cp-profile',
    'connector-monitor',
    'tc',
    'cp-profile',
    'cg-list',
    'cp-list/:cgId',
    'cp-detail/:cpId',
    'overview',
    'analytics',
    'chargegroup',
    'chargegroup/:cgID',
    'map',
    'settings',
    'terminal',
    'home-d',
    'notifications'
  ]
  operationOffUsPath = ['tc', 'terminal']
  monitorOnUsPath = [
    'sales',
    'transaction',
    'txdetail/:txCode',
    'connector-monitor',
    'tc',
    'cp-profile',
    'cg-list',
    'cp-list/:cgId',
    'cp-detail/:cpId',
    'overview',
    'analytics',
    'chargegroup',
    'chargegroup/:cgID',
    'map',
    'settings',
    'notifications'
  ]
  monitorOffUsPath = ['sales', 'transaction', 'txdetail/:txCode', 'tc']
  supervisorOnUsPath = ['connector-monitor', 'tc', 'cg-list', 'cp-list/:cgId', 'cp-detail/:cpId', 'cp-profile', 'notifications']
  supervisorOffUsPath = ['tc']
  operationPath: any[] = []
  monitorPath: any[] = []
  adminPath: any[] = ['management', 'user/:code']
  supervisorPath: any[] = []
  ocppServer: string = ''

  async canActivate(next: ActivatedRouteSnapshot) {
    const availableRoles: any = await this.db.getFromStorage('availableRoles')
    const role: any = await this.db.getFromStorage('role')
    await this.pathConstructor()
    const path = next?.routeConfig?.path ? next.routeConfig.path : ''
    if (path === 'cpo-menu' && availableRoles.message.length > 1) {
      return true
    } else if (role.message === null) {
      this.router.navigate(['login'])
      return false
    } else {
      const roleType = role.message?.roleType
      if (
        (roleType.toLowerCase().includes('service_api') && (this.adminPath.includes(path) || this.adminPath.includes(path.split('/').slice(-1)[0]))) ||
        (roleType.toLowerCase().includes('admin') && (this.adminPath.includes(path) || this.adminPath.includes(path.split('/').slice(-1)[0]))) ||
        (roleType.toLowerCase().includes('monitor') && (this.monitorPath.includes(path) || this.monitorPath.includes(path.split('/').slice(-1)[0]))) ||
        (roleType.toLowerCase().includes('finance') && (this.financePath.includes(path) || this.financePath.includes(path.split('/').slice(-1)[0]))) ||
        (roleType.toLowerCase().includes('operation') && (this.operationPath.includes(path) || this.operationPath.includes(path.split('/').slice(-1)[0]))) ||
        (roleType.toLowerCase().includes('supervisor') && (this.supervisorPath.includes(path) || this.supervisorPath.includes(path.split('/').slice(-1)[0])))
      ) {
        return true
      } else {
        this.router.navigate([await this.redirect(roleType)])
        return false
      }
    }
  }

  private async pathConstructor() {
    const merchant: any = await this.db.getFromStorage('merchant')
    this.ocppServer = merchant.message?.ocppServer
    let newOperator = false
    if (!this.ocppServer) {
      const operatorId: any = await this.db.getFromStorage('operatorId')
      newOperator = this.operatorIdOcppOnUs(operatorId.message)
    }
    if (!newOperator) {
      const role: any = await this.db.getFromStorage('role')
      newOperator = role.message.roleType.split('|')[0].split(':')[3] === role.message.roleType.split('|')[0].split(':')[4]
    }
    if (merchant.message?.ocppServer === 'PAID_CHAIN' || newOperator) {
      this.adminPath = this.financePath.concat(this.operationOnUsPath)
      this.operationPath = cloneDeep(this.operationOnUsPath)
      this.monitorPath = cloneDeep(this.monitorOnUsPath)
      this.supervisorPath = cloneDeep(this.supervisorOnUsPath)
    } else {
      this.adminPath = this.financePath.concat(this.operationOffUsPath)
      this.operationPath = cloneDeep(this.operationOffUsPath)
      this.monitorPath = cloneDeep(this.monitorOffUsPath)
      this.supervisorPath = cloneDeep(this.supervisorOffUsPath)
    }
  }

  async redirect(roleType: string) {
    await this.pathConstructor()
    switch (roleType.split('|')[1].toLowerCase()) {
      case 'admin':
      case 'super_admin':
        return `home/${this.adminPath[0]}`
      case 'finance':
        return `home/${this.financePath[0]}`
      case 'operation':
        if (this.ocppServer !== 'PAID_CHAIN') {
          return `home/${this.operationOffUsPath[0]}`
        } else {
          return `home/${this.operationOnUsPath[0]}`
        }
      case 'monitor':
        if (this.ocppServer !== 'PAID_CHAIN') {
          return `home/${this.monitorOffUsPath[0]}`
        } else {
          return `home/${this.monitorOnUsPath[0]}`
        }
      case 'supervisor':
        if (this.ocppServer !== 'PAID_CHAIN') {
          return `home/${this.supervisorOffUsPath[0]}`
        } else {
          return `home/${this.supervisorOnUsPath[0]}`
        }
    }
    return ''
  }

  operatorIdOcppOnUs(operatorId: string) {
    const operatorIdOnUs = [
      'iCURKo3MjzYaLQqxXMkwt',
      '4DzkOXbRFB2gVgtX8XKOA',
      'DkGtJzHHtkiEgGUjy2MjQ',
      'RPa8PaT8Gw8eybn2jCVUF',
      'ANpyjRRTybzkVTNbHaDHL',
      'F2yLopIs3tdpOCE5gwI33',
      'LjESMvS6ZyMEaf6IBlT2B',
      'vbSyCRZmvR9Ut6JESXdnh'
    ]
    if (operatorIdOnUs.includes(operatorId)) {
      return true
    } else {
      return false
    }
  }
}
