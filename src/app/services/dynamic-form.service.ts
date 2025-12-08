import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { DynamicFormComponent } from '../component/dynamic-form/dynamic-form.component';

export interface DialogField {
  name: string;
  type: 'input' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'date' | 'autocomplete' | 'address' | 'time';
  label: string;
  placeholder?: string;
  required?: boolean;
  inputType?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';
  options?: { label: string; value: any }[];
  validation?: any;
  errorMessage?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  passwordRules?: any;
  displayWith?: (value: any) => string;
  step?: number;
  value?: any;
  autocomplete?: string;
  pattern?: string;
  // Time-specific properties
  timeFormat?: 'HH:mm' | 'HH:mm:ss' | 'HH:mm:ss.SSS';
  addMinutes?: number; 
  outputFormat?: 'iso' | 'date' | 'string'; // Output format
}

export interface DialogConfig {
  title?: string;
  submitText?: string;
  cancelText?: string;
  width?: string;
  maxHeight?: string;
  disableClose?: boolean;
}

export interface DialogResult {
  submitted: boolean;
  data?: any;
}

@Injectable({
  providedIn: 'root'
})
export class DynamicDialogService {

  constructor(
    private dialog: MatDialog,
    private http: HttpClient
  ) {}

  /**
   * Open dialog by loading fields from JSON file
   */
  openDialogFromJson(
    jsonPath: string, 
    config: DialogConfig = {}
  ): Observable<DialogResult> {
    return this.http.get<DialogField[]>(jsonPath).pipe(
      switchMap(fields => {
        const dialogRef: MatDialogRef<DynamicFormComponent> = this.dialog.open(
          DynamicFormComponent,
          {
            width: config.width || '600px',
            maxHeight: config.maxHeight || '80vh',
            disableClose: config.disableClose || false,
            data: {
              fields: fields,
              title: config.title || 'Form',
              submitText: config.submitText || 'Submit',
              cancelText: config.cancelText || 'Cancel'
            }
          }
        );

        return dialogRef.afterClosed().pipe(
          map(result => ({
            submitted: !!result,
            data: result || null
          }))
        );
      }),
      catchError(error => {
        console.error('Failed to load form configuration from JSON:', error);
        throw new Error(`Could not load form configuration from ${jsonPath}`);
      })
    );
  }
}