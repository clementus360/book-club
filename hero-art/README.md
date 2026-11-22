# Homepage slides

One folder per slide, each holding two images (png, jpg or webp):

    hero-art/
      the-hobbit/
        background.jpg    fills the paint; at least 1500px tall
        character.png     transparent, about 2000px wide, running past the bottom

Then run `npm run hero`. Slides appear in alphabetical order; start a folder
with a number ("2-the-hobbit") to choose the order.

The folder name becomes the description read to people who cannot see the
picture. To write a better one, or to move the character, add an entry for the
folder in `src/lib/hero.ts`.
