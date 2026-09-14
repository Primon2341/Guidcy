# Guidcy search character

Source: the blue-hoodie character image supplied by the user. Prepared with the built-in image generation tool. Final asset: `guidcy-boy-poses.png`.

Three equal-width cells contain thinking, magnifying-glass and waving poses. The page blends the white sprite backdrop with its existing background; this file does not contain an alpha channel. Speech bubbles and hide-and-seek motion are implemented in the companion CSS/JavaScript.

## Pose preparation prompt

Use case: identity-preserve
Asset type: one transparent horizontal sprite sheet for a website animation.
Edit the supplied image. Preserve the EXACT boy character identity, face, black tousled hair, skin tone, blue hoodie with small white G, proportions, and clean 2D cartoon drawing style. This is the user's chosen mascot; do not invent a replacement.
Extract and adapt THREE upper-body poses into a single horizontal 3-column sprite sheet. Each column is exactly one third of the total canvas width. Each cell is an identical square, with the character centered and the same scale. Transparent alpha background everywhere outside the characters.
LEFT CELL: thinking boy from the third pose in the original top row, hand on chin, curious upward glance.
MIDDLE CELL: magnifying-glass boy from the fourth pose in the original top row, holding magnifier up and looking attentive.
RIGHT CELL: happy waving boy from the far-right bottom pose, smiling and waving, omit laptop/tablet.
Show only head, hoodie upper torso, arms and hands in each cell, cropped at the waist at the BOTTOM of each square cell, as if each boy is peeking from behind the top edge of a search bar. Hair, magnifying glass and waving hand fully visible. Keep minimal 5% clear margins at the top and sides, upper bodies fill cells. Same face size, same waist baseline in all three cells.
Remove ALL original backdrop, gradients, shadows, ground, oval bases, bubbles, lettering outside the hoodie G, laptop logos, sparkles and props except the magnifier in the middle cell. No boxes, no grid lines, no separators. No speech or thought bubbles; the website supplies these in code. Genuinely transparent PNG, not a painted checkerboard. Exactly THREE aligned poses in ONE ROW, not a collage and not extra characters. Wide 3:1 aspect ratio.

## Final background correction prompt

Replace the gray checkered background with a perfectly plain SOLID PURE WHITE #FFFFFF background. Remove every checker square, faint gray scribble, shadow, texture and pattern outside the three boys. Keep all three cartoon boy poses exactly the same: same identity, style, hair, blue G hoodie, expressions and magnifier. Keep the exact 3:1 horizontal canvas and equal-third cell placement. All outside pixels must be flat white RGB 255,255,255, including gaps inside arm silhouettes and hair tufts. No transparency requested; use a clean WHITE background. Do not add anything else.
