Vehicle transport: report points 1–10
===================================

The vehicle flow starts at `vehicle-request`. A customer-scoped local draft owns
vehicle data, condition, both addresses, schedule and photos. Existing vehicle
URLs redirect into this flow. Other services retain their own forms.

Drafts persist across app restarts. Picked images are copied into application
document storage. Draft data and copied images are cleared after submission.
The backend uses the client draft identifier to make draft creation repeatable.
Successful photo uploads are recorded before retrying submission.

Deployment dependency
---------------------

Deploy the backend migration `20260906090000_vehicle_transport_condition_fields`
and regenerate Prisma Client before releasing the new mobile builds. It adds
mobility, multiple issues, transmission and a customer-scoped draft identifier.
The migration has been prepared; development work does not apply it to a live
database. Existing vehicle condition fields remain available for older apps.
The accompanying driver screens display the new structured vehicle fields.

Vehicle lookup reuses the configured providers. The new registration endpoint
accepts a Swiss Stammnummer without requiring a VIN. Ambiguous lookup results
fall back to manual selection. The existing Google Maps/Places configuration is
used for autocomplete, country fallback and route distance.

Translation review
------------------

`src/localization/translation-review.csv` contains all text keys and six language
columns. Regenerate it with `node scripts/export-translations.js` after changing
locale files. Empty cells identify existing translations needing review.

Automated verification
----------------------

- Client: `npm run typecheck`, `npm run lint`, `npm test`.
- Backend: `npx tsc --noEmit -p tsconfig.build.json`, Prisma schema validation,
  and the vehicle request / VIN provider tests.
- Driver: type checking and lint for the changed request screens and component.

Physical-device acceptance still required
-----------------------------------------

No Android devices were connected during implementation. The following checks
must be performed with the updated backend and customer/driver builds:

1. Submit a complete vehicle request without photos.
2. Add four photos, edit/remove/reopen them, and confirm the counter reads 4/8
   before removal. Deny photo permission and continue without photos.
3. Edit pickup, delivery, vehicle, condition and schedule independently. Confirm
   every other section stays intact and address changes refresh the distance.
4. Restart the customer app and reopen vehicle transport. Confirm the draft and
   photos survive. Sign into another account and confirm no draft is shared.
5. Select one basic condition and several additional issues; verify all of them,
   vehicle weight, addresses, appointment and photos in the driver app.
6. Exercise every review edit button; no goods/furniture fields should appear.
7. Make a required field empty or let the appointment expire. Tap its translated
   error, correct the highlighted field and verify submission becomes available.
8. Switch Arabic ↔ German/English/French in release builds. Arabic must be RTL;
   the other languages and stages must be LTR. Check date and 24-hour spinners
   on both Android and iOS.
9. Allow location and check nearby address results. Deny location and verify the
   account-country fallback, full address and fixed confirmation button. Test
   small screens with the keyboard and Android gesture/three-button navigation.
10. Start a goods request after submitting a vehicle request. Vehicle data must
    not appear in it.
