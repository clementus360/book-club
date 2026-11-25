// The artwork for the homepage. Paths are relative to the project folder.
// After changing this or any source image, run: npm run hero
const config = {
  // Any image with transparency, or an SVG. Painted = visible.
  splash: "../Paint splash@4x.png",
  // Empty space above the splash for characters to rise into, as a share of its height.
  headroom: 0.2,
  // Characters may rise out of the top only between these points, left to right.
  rise: [0.07, 0.88],
  // Which way the brush goes when one slide is painted over another, in degrees.
  stroke: -24,
  // Every folder in here with a background and a character is a slide. See its README.
  folder: "hero-art",
  // Slides kept elsewhere come first. `focus` is the point of the background to
  // keep when cropping: 0,0 is top left.
  slides: [],
};

export default config;
