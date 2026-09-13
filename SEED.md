# Roland Invests — Demo Reference

## Admin
- URL:  /dollyb14
- User: admin
- Pass: [the ADMIN_PASS you set in Render env vars]

## Test user accounts (create these before the demo)
1. Email-method user
   - Sign up at /signup.html
   - Email: demo1@example.com
   - Password: demo1234

2. Google-method user
   - Click "Sign in with Google" at /login.html
   - Email: demo2@example.com
   - Password: demo1234

## Suggested demo flow

1. Landing page — point out the featured stock and its live movement.
2. Sign up as demo1@example.com.
3. Dashboard — show the KYC banner, empty holdings.
4. Fund wallet → Bank transfer → show the 5-minute countdown.
5. Click "I've made the transfer".
6. Open admin in another tab → /dollyb14 → Transactions → Approve the deposit.
7. Refresh user dashboard → balance updated.
8. Buy 10 DANGCEM → show countdown and reference.
9. Admin → approve the buy.
10. Refresh user dashboard → holdings show DANGCEM.
11. Submit KYC → admin → KYC → approve.
12. Withdraw → balance deducted → admin → Transactions → reject with reason.
13. Refresh user → balance refunded, reason visible.
14. Admin → Payments → show the live feed with card data.
15. Admin → Site content → change brand name to "Test Brand" → reload user site → everywhere updated.
16. Change it back.

## Fonts (optional, recommended)
Until self-hosted fonts are added, the site uses system fonts gracefully. To add them:

    mkdir -p client/fonts
    # Download from Google Fonts (OFL):
    # - Newsreader 500, 600 (woff2)
    # - IBM Plex Sans 400, 500, 600 (woff2)
    # Save as:
    #   client/fonts/Newsreader-500.woff2
    #   client/fonts/Newsreader-600.woff2
    #   client/fonts/IBMPlexSans-400.woff2
    #   client/fonts/IBMPlexSans-500.woff2
    #   client/fonts/IBMPlexSans-600.woff2

No other changes needed.