// Path of a file in public/, honouring the deploy base path (GitHub Pages serves this site from /x/).
// Use it for every src/href that points into public/; a bare "/logo.png" breaks under a base path.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const asset = (path: string) => `${base}/${path.replace(/^\//, '')}`;
