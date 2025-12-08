import { Injectable } from '@angular/core'
import { MatDateFormats } from '@angular/material/core'

@Injectable({
  providedIn: 'root'
})
export class DateFormatService {
  constructor() {}
}

export const CUSTOM_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'DD/MM/YYYY' // Parsing format
  },
  display: {
    dateInput: 'DD/MM/YYYY', // Display format in input fields
    monthYearLabel: 'MMMM YYYY', // Format for month/year label in datepicker
    dateA11yLabel: 'DD/MM/YYYY', // Format for accessibility (e.g., screen readers)
    monthYearA11yLabel: 'MMMM YYYY' // Accessibility format for month/year label
  }
}
