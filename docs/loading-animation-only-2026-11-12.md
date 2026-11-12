# Loading animation without placeholder shapes

Page loading now uses the existing centered Guidcy blue/green text and segmented bar. Removed the generic dashboard rectangle, boot shimmer cards, homepage feed blocks, profile cover/avatar/text shapes, category and Jobs cards, Funds placeholders, AI Finder loading card/dots and Careers shimmer cards. The state class remains for request/cache compatibility but no longer draws a box or pseudo-element.

The shared loading owner also tracks initial status markup, both profile routes, Blog and the actual Funds results container. Profile completion is detected after nested header commits, so the animation stops once the profile arrives. Secondary profile/activity requests do not hold the main animation open. Real content, errors and empty results continue to render; existing content remains mounted during same-section refreshes.

Profile renderers continue to own same-person restoration and booking updates. Switching people must install the new booking DOM rather than retain the previous profile. Loading-marker detection requires an actual HTML attribute so a post mentioning that attribute cannot be mistaken for a loading state. Authentication, API calls, booking/payment logic and database data are unchanged.

Validation includes the build, eight panel/homepage checks, shared loading browser checks across 14 cold-load surfaces, nested profile completion, no placeholder pseudo-elements, real records and failure states, and navigation/secondary-request behavior. Mobile/desktop finder layout checks and four dashboard reloads with slow fonts/auth/data pass. Community/profile browser checks cover both profile types, cold/warm loads, post/follow/profile editing and booking entry points. No deployment performed by this task.
