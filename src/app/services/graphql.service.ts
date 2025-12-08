import { Injectable } from '@angular/core'
import { ApolloClient, HttpLink, InMemoryCache, NormalizedCacheObject } from '@apollo/client'
import { Credentials } from './common.service'

type ApolloClients = { [endpoint: string]: { client: ApolloClient<NormalizedCacheObject>; validUntil: Date } }

@Injectable({
  providedIn: 'root'
})
export class GraphqlService {
  private clients: ApolloClients = {}
  constructor() {}

  registerClient(endpoint: string, headers: Credentials, newHeaders?: boolean): ApolloClient<NormalizedCacheObject> {
    if (this.clients[endpoint] && !newHeaders) {
      const validUntil = this.clients[endpoint].validUntil
      const now = new Date()
      if (now.valueOf() >= validUntil.valueOf()) {
        newHeaders = true
      } else {
        return this.clients[endpoint].client
      }
    }
    if (newHeaders) {
      this.clearClient()
    }
    const link = new HttpLink({ uri: endpoint, headers: headers })

    const cache = new InMemoryCache({ addTypename: false })

    const client = new ApolloClient({ link, cache: cache })
    this.clients[endpoint] = { client: client, validUntil: new Date() }
    return client
  }

  clearClient() {
    this.clients = {}
  }
}
