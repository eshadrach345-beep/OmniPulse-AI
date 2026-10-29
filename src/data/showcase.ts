// Your sample videos for the landing page.
//
// 1. Make 3 to 6 of your best videos in OmniPulse and download them (use the "Download full video" button).
// 2. Copy the MP4 files into the folder  public/showcase/  (keep each one under about 15 MB so the page loads fast).
// 3. Add a line for each one below. Delete the example comment markers so the section appears.
//
// While this list is empty the "Made with OmniPulse" section is hidden, so visitors never see an empty gallery.
export interface ShowcaseItem {
  title: string;
  /** Short label such as the genre. */
  tag: string;
  /** File in public/showcase, for example '/showcase/midnight-courier.mp4'. */
  src: string;
  /** Optional poster image in public/showcase (the poster you downloaded from the app works well). */
  poster?: string;
}

export const SHOWCASE: ShowcaseItem[] = [
  // { title: 'Midnight Courier', tag: 'Action', src: '/showcase/midnight-courier.mp4', poster: '/showcase/midnight-courier.png' },
];
