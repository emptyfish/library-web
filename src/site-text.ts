// Wording shown on the site. Edit anything here; no other file needs to change.
//
// • Set a line to '' (empty) to hide it.
// • These placeholders are filled in automatically:
//     {books}   number of books        {authors} number of authors
//     {pages}   total pages            {rated}   books with a Goodreads rating
//     {average} average Goodreads rating (e.g. 3.94)

export const siteText = {
  /** Name in the header, browser tab and footer. */
  siteName: 'The Library',

  /** Summary used by search engines and link previews. */
  description: 'An archive of {books} books, organized by the bookcase and shelf where each one sat.',

  home: {
    // Banner at the top
    eyebrow: '', // small capitals above the title
    title: 'The Library',
    tagline: '',
    showStats: true, // the books / authors / pages counts in the banner

    // Location cards
    locationsHeading: 'Browse by location',
    locationsSubtext: '',

    // Ratings chart
    ratingsHeading: 'How the collection rates',
    ratingsSubtext: 'Goodreads average for {rated} of the books.',
    ratingsAverageLabel: 'average rating across the shelves',
    ratingsFootnote: 'Bars show books grouped by whole-star average (e.g. 4.37 counts as 4+).',

    // Top authors list
    authorsHeading: 'Most-shelved authors',
    authorsSubtext: 'The ten names that turn up most often.',
    authorsLink: 'All {authors} authors, A–Z',

    // "Random book" box at the bottom ('' for the heading hides the whole box)
    randomHeading: 'Not sure where to start?',
    randomSubtext: 'Pull a book off a shelf at random.',
    randomButton: 'Pick a random book',
  },

  footer: {
    left: 'An archive of {books} books, catalogued as they were shelved.',
    right: 'Catalog snapshot December 2024 · Book details and covers from Goodreads',
  },
};
