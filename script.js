// Constants
const GUTENBERG_API = "https://gutendex.com/books";
const ITEMS_PER_PAGE = 32;
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect width="200" height="300" fill="%23f3f4f6"/%3E%3Ctext x="100" y="150" font-family="Arial" font-size="14" fill="%239ca3af" text-anchor="middle"%3ENo Image Available%3C/text%3E%3C/svg%3E';

// State management
let currentPage = 1;
let currentSearch = "";
let currentCategory = "all";
let isLoading = false;
let lastRequestController = null;
let currentBookId = null;

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  addBookNavigation();
  loadBooks();
});

  // Search with debounce
  let searchTimeout;
  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value;
      resetAndLoad();
    }, 300);
  });

  // Category filters
  const categoryFilters = document.getElementById("categoryFilters");
  categoryFilters.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      updateCategoryButtons(e.target);
      currentCategory = e.target.dataset.category;
      resetAndLoad();
    }
  });

  // Load more button
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  loadMoreBtn.addEventListener("click", () => {
    currentPage++;
    loadBooks(false);
  });

  // Infinite scroll
  window.addEventListener("scroll", handleInfiniteScroll);

// Book loading and rendering functions
async function loadBooks(reset = true) {
  if (isLoading) return;

  try {
    isLoading = true;
    showLoading();

    if (lastRequestController) {
      lastRequestController.abort();
    }
    lastRequestController = new AbortController();

    const url = buildApiUrl();
    const response = await fetchBooks(url);
    const data = await response.json();

    updateBookGrid(data, reset);
  } catch (error) {
    handleLoadError(error);
  } finally {
    isLoading = false;
    hideLoading();
  }
}

function buildApiUrl() {
  let url = `${GUTENBERG_API}?page=${currentPage}`;

  if (currentSearch) {
    url += `&search=${encodeURIComponent(currentSearch)}`;
  }

  if (currentCategory !== "all") {
    url += `&topic=${encodeURIComponent(currentCategory)}`;
  }

  return url;
}

async function fetchBooks(url) {
  const response = await fetch(url, {
    signal: lastRequestController.signal
  });

  if (!response.ok) {
    throw new Error("Failed to fetch books");
  }

  return response;
}

// Book UI and rendering functions
function createBookCard(book) {
  const card = document.createElement("div");
  card.className = "book-card rounded-lg overflow-hidden theme-transition";

  const coverUrl = book.formats["image/jpeg"] || PLACEHOLDER_IMAGE;

  card.innerHTML = `
    <div class="aspect-w-2 aspect-h-3">
      <img 
        src="${coverUrl}" 
        alt="${book.title}" 
        class="w-full h-full object-cover"
        onerror="this.src='${PLACEHOLDER_IMAGE}'"
        loading="lazy"
      >
    </div>
    <div class="p-4">
      <h3 class="font-bold text-lg mb-2 dark:text-white line-clamp-2">${book.title}</h3>
      <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">${book.authors[0]?.name || "Unknown Author"}</p>
      <button 
        onclick="readBook(${book.id})"
        class="w-full px-4 py-2 btn-primary rounded-md"
      >
        Read Book
      </button>
    </div>
  `;

  return card;
}

function updateBookGrid(data, reset) {
  const bookGrid = document.getElementById("bookGrid");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  if (reset) {
    bookGrid.innerHTML = "";
  }

  if (data.results.length === 0) {
    showNoResults();
  } else {
    data.results.forEach(book => {
      const card = createBookCard(book);
      bookGrid.appendChild(card);
    });
  }

  loadMoreBtn.style.display = data.next ? "block" : "none";
}

function showNoResults() {
  const bookGrid = document.getElementById("bookGrid");
  bookGrid.innerHTML = `
    <div class="col-span-full text-center py-8 text-gray-600 dark:text-gray-400">
      No books found. Try a different search term.
    </div>
  `;
}

// Book reader functionality
async function readBook(bookId) {
  try {
    currentBookId = bookId;
    showLoading();
    const book = await fetchBookDetails(bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    setupReader(book);
    await loadBookContent(book);
    addToRecentBooks(book);
    loadReadingProgress(bookId);
  } catch (error) {
    console.error("Error loading book:", error);
    showLoadingError();
  } finally {
    hideLoading();
  }
}

async function fetchBookDetails(bookId) {
  const response = await fetch(`${GUTENBERG_API}/${bookId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch book details");
  }
  return await response.json();
}

function setupReader(book) {
  const bookReader = document.getElementById("bookReader");
  const bookTitle = document.getElementById("bookTitle");
  const bookAuthor = document.getElementById("bookAuthor");
  const bookContent = document.getElementById("bookContent");

  bookContent.innerHTML = "";
  bookTitle.textContent = book.title || "Untitled";
  bookAuthor.textContent = book.authors?.[0]?.name || "Unknown Author";

  bookReader.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

// Content processing
async function loadBookContent(book) {
  const textUrl = book.formats["text/plain; charset=utf-8"] || book.formats["text/plain"];
  const htmlUrl = book.formats["text/html"];

  try {
    if (htmlUrl) {
      await fetchAndProcessContent(htmlUrl, true);
    } else if (textUrl) {
      await fetchAndProcessContent(textUrl, false);
    } else {
      throw new Error("No readable format available");
    }
  } catch (error) {
    throw new Error(`Failed to load book content: ${error.message}`);
  }
}

async function fetchAndProcessContent(url, isHtml) {
  const response = await fetchWithCorsProxy(url);
  if (!response) {
    throw new Error("Failed to fetch content");
  }

  const content = await response.text();
  const processedContent = isHtml ? 
    await processHtmlContent(content) : 
    processPlainTextContent(content);

  const bookContent = document.getElementById("bookContent");
  bookContent.innerHTML = processedContent;

  if (isHtml) {
    await loadBookImages(bookContent);
  }

  bookContent.classList.add("page-turn");
  setTimeout(() => {
    bookContent.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

// Content processing functions
async function processHtmlContent(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  
  // Remove unwanted elements
  const elementsToRemove = doc.querySelectorAll('script, style, link, meta, iframe');
  elementsToRemove.forEach(element => element.remove());
  
  // Extract the main content (usually in body)
  const body = doc.body;
  
  // Clean up the content
  const cleanContent = sanitizeHtml(body.innerHTML);
  
  // Format the content for the reader
  return `
    <div class="reader-content">
      ${cleanContent}
    </div>
  `;
}

function processPlainTextContent(content) {
  // Split content into paragraphs
  const paragraphs = content
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`);
    
  return `
    <div class="reader-content">
      ${paragraphs.join('\n')}
    </div>
  `;
}

function sanitizeHtml(html) {
  // Basic HTML sanitization
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
}

// Progress tracking
function saveReadingProgress(bookId) {
  const bookContent = document.getElementById("bookContent");
  const scrollPosition = bookContent.scrollTop;
  const progress = JSON.parse(localStorage.getItem("readingProgress") || "{}");
  progress[bookId] = scrollPosition;
  localStorage.setItem("readingProgress", JSON.stringify(progress));
}

function loadReadingProgress(bookId) {
  try {
    const progress = JSON.parse(localStorage.getItem("readingProgress") || "{}");
    const position = progress[bookId];
    if (position) {
      const bookContent = document.getElementById("bookContent");
      bookContent.scrollTop = position;
    }
  } catch (error) {
    console.warn("Failed to load reading progress:", error);
  }
}

// Recent books functionality
function addToRecentBooks(book) {
  const recentBooks = JSON.parse(localStorage.getItem("recentBooks") || "[]");
  const existingIndex = recentBooks.findIndex(b => b.id === book.id);
  
  if (existingIndex !== -1) {
    recentBooks.splice(existingIndex, 1);
  }
  
  recentBooks.unshift({
    id: book.id,
    title: book.title,
    author: book.authors[0]?.name || "Unknown Author",
    timestamp: Date.now()
  });

  // Keep only last 10 books
  if (recentBooks.length > 10) {
    recentBooks.pop();
  }

  localStorage.setItem("recentBooks", JSON.stringify(recentBooks));
}

// Navigation handlers
function handleInfiniteScroll() {
  const scrollThreshold = document.documentElement.scrollHeight - 1000;
  if (window.innerHeight + window.scrollY >= scrollThreshold) {
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (!isLoading && loadMoreBtn.style.display !== "none") {
      currentPage++;
      loadBooks(false);
    }
  }
}

function resetAndLoad() {
  currentPage = 1;
  document.getElementById("bookGrid").innerHTML = "";
  loadBooks();
}

// UI helpers
function showLoading() {
  document.getElementById("loadingSpinner").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingSpinner").classList.add("hidden");
}

function showLoadingError() {
  const bookContent = document.getElementById("bookContent");
  bookContent.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-gray-600 dark:text-gray-400">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <h3 class="text-xl font-bold mb-2">Error Loading Book</h3>
      <p class="text-center">Sorry, we couldn't load this book. Please try again later.</p>
      <button 
        onclick="closeReader()"
        class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Close Reader
      </button>
    </div>
  `;
}

function closeReader() {
  const reader = document.getElementById("bookReader");
  reader.classList.add("opacity-0");
  setTimeout(() => {
    reader.classList.add("hidden");
    reader.classList.remove("opacity-0");
    document.body.style.overflow = "";
    document.getElementById("bookContent").innerHTML = "";
  }, 300);
}

// CORS proxy functionality
async function fetchWithCorsProxy(url) {
  const proxyUrls = [
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.codetabs.com/v1/proxy?quest='
  ];

  for (const proxyUrl of proxyUrls) {
    try {
      const response = await fetch(proxyUrl + encodeURIComponent(url));
      if (response.ok) {
        return response;
      }
    } catch (error) {console.warn(`Failed to fetch with proxy ${proxyUrl}:`, error);
      continue;
    }
  }

  // Try direct fetch as fallback
  try {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
  } catch (error) {
    console.warn('Direct fetch failed:', error);
  }

  throw new Error('Failed to fetch content with all available methods');
}

// Image loading function
async function loadBookImages(contentElement) {
  const images = contentElement.getElementsByTagName('img');
  for (const img of images) {
    try {
      const response = await fetchWithCorsProxy(img.src);
      if (response) {
        const blob = await response.blob();
        img.src = URL.createObjectURL(blob);
      }
    } catch (error) {
      console.warn('Failed to load image:', img.src);
      img.style.display = 'none';
    }
  }
}

// Category button management
function updateCategoryButtons(selectedButton) {
  const buttons = document.querySelectorAll('#categoryFilters button');
  buttons.forEach(button => {
    if (button === selectedButton) {
      button.classList.add('bg-blue-600', 'text-white');
      button.classList.remove('bg-gray-200', 'dark:bg-gray-800');
    } else {
      button.classList.remove('bg-blue-600', 'text-white');
      button.classList.add('bg-gray-200', 'dark:bg-gray-800');
    }
  });
}

// Error handling
function handleLoadError(error) {
  if (error.name === 'AbortError') {
    return; // Ignore aborted requests
  }
  
  console.error('Error loading books:', error);
  const bookGrid = document.getElementById("bookGrid");
  bookGrid.innerHTML = `
    <div class="col-span-full text-center py-8 text-gray-600 dark:text-gray-400">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <h3 class="text-xl font-bold mb-2">Error Loading Books</h3>
      <p>Sorry, something went wrong. Please try again later.</p>
      <button 
        onclick="resetAndLoad()"
        class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Try Again
      </button>
    </div>
  `;
}

// Book navigation
function addBookNavigation() {
  const bookContent = document.getElementById("bookContent");
  
  // Add keyboard navigation
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("bookReader").classList.contains("hidden")) {
      switch(e.key) {
        case "ArrowLeft":
          navigatePage("prev");
          break;
        case "ArrowRight":
          navigatePage("next");
          break;
        case "Escape":
          closeReader();
          break;
      }
    }
  });

  // Add touch navigation
  let touchStartX = 0;
  let touchEndX = 0;

  bookContent.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  });

  bookContent.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  });

  function handleSwipe() {
    const swipeThreshold = 50;
    const swipeLength = touchEndX - touchStartX;

    if (Math.abs(swipeLength) > swipeThreshold) {
      if (swipeLength > 0) {
        navigatePage("prev");
      } else {
        navigatePage("next");
      }
    }
  }

  // Add navigation controls
  const navigationControls = document.createElement("div");
  navigationControls.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg shadow-lg theme-transition";
  navigationControls.innerHTML = `
    <button id="prevPage" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <button id="nextPage" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  `;

  document.getElementById("bookReader").appendChild(navigationControls);

  document.getElementById("prevPage").addEventListener("click", () => navigatePage("prev"));
  document.getElementById("nextPage").addEventListener("click", () => navigatePage("next"));
}

function navigatePage(direction) {
  const bookContent = document.getElementById("bookContent");
  const currentScroll = bookContent.scrollTop;
  const pageHeight = bookContent.clientHeight;
  const scrollAmount = direction === "next" ? pageHeight : -pageHeight;

  bookContent.scrollTo({
    top: currentScroll + scrollAmount,
    behavior: "smooth"
  });
}
