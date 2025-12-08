import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MerchantHubComponent } from './merchant-hub.component';

describe('MerchantHubComponent', () => {
  let component: MerchantHubComponent;
  let fixture: ComponentFixture<MerchantHubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MerchantHubComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MerchantHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
