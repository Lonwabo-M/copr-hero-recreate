import CustomerShell from "@/components/shells/CustomerShell";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function Legal() {
  return (
    <CustomerShell activeItem="Legal">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Legal</h1>
            <p className="page-subtitle">Terms of service, privacy policy, and legal information</p>
          </div>
          <div className="legal-section">
            <h3>Terms of Service</h3>
            <p>Welcome to Lasha Logistics. By accessing or using our platform, you agree to be bound by these Terms of Service. Lasha provides logistics infrastructure services including parcel delivery, tracking, and fleet management solutions.</p>
            <p>All deliveries are subject to our standard terms of carriage. Lasha accepts liability for loss or damage to parcels up to the declared value, subject to our claims process. Delivery timeframes are estimates and may vary based on location, weather, and traffic conditions.</p>
            <p>Users are responsible for ensuring that parcels comply with all applicable laws and regulations. Prohibited items include hazardous materials, illegal substances, and perishable goods without appropriate packaging.</p>
          </div>
          <div className="legal-section">
            <h3>Privacy Policy</h3>
            <p>Lasha collects personal information necessary to provide our logistics services, including your name, email address, phone number, and delivery addresses. We use this information solely for order processing, delivery coordination, and account management.</p>
            <p>We do not sell your personal information to third parties. Location data collected during deliveries is used exclusively for real-time tracking and route optimization, and is retained for 90 days after delivery completion.</p>
            <p>You may request access to, correction of, or deletion of your personal information at any time by contacting our privacy team at privacy@lasha.co.za.</p>
          </div>
          <div className="legal-section">
            <h3>Cookie Policy</h3>
            <p>Lasha uses essential cookies to maintain your session and preferences. Analytics cookies help us improve our platform. You can manage cookie preferences through your browser settings.</p>
          </div>
          <div className="legal-section">
            <h3>Refund Policy</h3>
            <p>Refund requests must be submitted within 7 days of delivery completion. Approved refunds are processed within 5-10 business days to the original payment method. Wallet credits are applied immediately upon approval.</p>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
