# SmartCanteen roadmap

## Backend migration (Lovable Cloud enabled)
- [x] Enable Cloud
- [x] Schema: profiles, user_roles, canteen_books, has_role()
- [x] Server functions: provision operator/agent (phone + OTP), deactivate, delete
- [x] Rewire src/lib/auth.tsx to real accounts (keep API shape)
- [ ] Cloud-backed cash book sync (offline-first, cleared data stays cleared)

## Requested changes
- [x] Repair pictured icons throughout the site with a locally hosted, complete icon subset.
- [x] Remove the Running Low stock control and its indicator.
- [x] Delete linked stock purchases, checks, and itemised sale portions when removing an item so current figures reconcile.
1. [ ] Working onboarding for new agents + operators (real accounts)
2. [ ] New accounts start with zero data; clearing data is permanent
3. [ ] Login page UI consistent on phone/tablet, no glitches
4. [ ] Wizard step cards 1-4 responsive, no cut-off text
5. [ ] Installable web app (PWA, Android + iOS)
6. [ ] Offline entry with background sync to backend
7. [x] Delete / deactivate operator accounts; deleted records no longer return from demo/browser data
8. [ ] WhatsApp-first onboarding: email optional, OTP delivery, PIN login option
