import type { CustomerInfo } from "@/types/dashboard";

interface CustomerDetailsTabProps {
  customer: CustomerInfo;
}

export default function CustomerDetailsTab({ customer }: CustomerDetailsTabProps) {
  return (
    <div className="dash-tab-content">
      <div className="dash-info-grid">
        <div className="dash-info-card">
          <div className="dash-info-label">Customer Name</div>
          <div className="dash-info-value">{customer.name}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Company</div>
          <div className="dash-info-value muted">{customer.company}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Email</div>
          <div className="dash-info-value muted">{customer.email}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Phone</div>
          <div className="dash-info-value muted">{customer.phone}</div>
        </div>
      </div>
    </div>
  );
}
