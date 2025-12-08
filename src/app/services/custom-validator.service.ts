import { Injectable } from '@angular/core'
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms'
import { Observable, of } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class CustomValidatorService {
  static required2(control: AbstractControl): ValidationErrors | null {
    let val = control.value

    if (val === null || val === '') return null

    if (!val.toString().match(/^[0-9]+(\.?[0-9]+)?$/)) return { invalidNumber: { error: true, name: 'cv' } }

    return null
  }

  // Number only validation

  static Numeric(control: AbstractControl): ValidationErrors | null {
    const val = control.value
    // Allow empty value or null to be valid
    if (val === null || val === '') return null

    // Regular expression to check if the value is a valid number (including decimals)
    const isNumeric = /^-?\d+(\.\d+)?$/.test(val)

    // Return error if the value is not numeric
    if (!isNumeric) {
      return { nonNumeric: true }
    }

    return null // Valid input
  }
}
