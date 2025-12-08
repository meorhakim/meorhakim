import { Inject, Injectable } from '@angular/core'
import { SwPush } from '@angular/service-worker'
import { Storage } from '@ionic/storage-angular'
import { GraphqlService } from './graphql.service'

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(
    @Inject(Storage) private storage: Storage,
    private swPush: SwPush,
    private graphql: GraphqlService
  ) {
    this.init()
  }
  async init() {
    this.storage = await this.storage.create()
  }

  async clearStorage() {
    if (this.swPush.isEnabled && (Notification.permission === 'granted' || Notification.permission === 'default')) {
      try {
        await this.swPush.unsubscribe()
      } catch (error) {}
    }
    await this.storage.clear()
    await this.graphql.clearClient()
  }

  setToStorage(sTable: any, sData: any) {
    return new Promise((resolve, reject) => {
      try {
        this.storage.set(sTable, sData).then(
          () => resolve({ error: 0 }),
          (error: any) => resolve({ error: 1001, message: error })
        )
      } catch (err) {
        resolve({ error: 1001, message: err })
      }
    })
  }

  getFromStorage(sTable: any) {
    return new Promise((resolve, reject) => {
      try {
        this.storage.get(sTable).then(
          (data: any) => resolve({ error: 0, message: data }),
          (error: any) => resolve({ error: 1001, message: error })
        )
      } catch (err) {
        resolve({ error: 1001, message: err })
      }
    })
  }

  removeFromStorage(sTable: any) {
    return new Promise((resolve, reject) => {
      try {
        this.storage.remove(sTable).then(
          () => resolve({ error: 0 }),
          (error: any) => resolve({ error: 1001, message: error })
        )
      } catch (err) {
        resolve({ error: 1001, message: err })
      }
    })
  }
}
