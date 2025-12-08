import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class EventsService {
  private subject = new Subject<any>()

  publishEvent(data: any) {
    this.subject.next(data)
  }
  getObservable(): Subject<any> {
    return this.subject
  }
}
