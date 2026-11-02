# RekberSTORE v1.0.0 — Fresh rebuild

## Included
- Dark Premium landing page and responsive dashboard.
- Supabase email/password registration and login server actions.
- Email verification callback route and protected dashboard middleware.
- Dashboard reads real transaction rows visible to the signed-in user.
- Initial database schema for roles, transactions, admin assignment, chat, disputes, KYC, DANA Business QR profile, payment references, settlement and audit.
- Private Storage bucket for admin documents.
- No live payment, custody, refund or payout code.

## Setup
1. Use Node.js 20.9+.
2. Copy `.env.example` to `.env.local`.
3. Fill Supabase project URL and anon key.
4. Apply `supabase/schema.sql` only to a fresh Supabase project.
5. Configure Supabase Auth Site URL and redirect URL: `http://localhost:3000/auth/callback`.
6. Run `npm install`, then `npm run dev`.
7. Open `http://localhost:3000`.

## Important limitations
- New accounts receive only buyer role. Never allow public self-assignment of admin/super_admin. Provision the first super_admin through a trusted, controlled operation.
- Admin KYC/QR upload and review screens, transaction workflow, admin assignment UI/RPC, realtime chat, dispute workflow and provider integration are not yet implemented.
- KYC and QR documents must remain private. The schema creates a private bucket but does not add upload policies.
- An uploaded QR image is not payment confirmation and does not authorize escrow/third-party collection.
- Live payments remain disabled until legal review and written provider approval.

## Verification
Source generated; npm install, lint, build, database migration and end-to-end tests have not been run in this environment. Do not deploy to production before these checks and a security review.
