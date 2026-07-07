const apiKey = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.apiKey) || "";

const CACHE_DURATION = 5 * 60 * 1000;
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;
const FEATURED_ROTATE_INTERVAL = 5000;
const SEARCH_DEBOUNCE_DELAY = 500;
const DAILY_REQUEST_LIMIT = 100;

let articles = [];
let featuredIndex = 0;
let newsChart = null;

let isLoading = false;
let activeController = null;
let lastAction = { type: "news" };

const cache = new Map();

// ===============================
// Safe localStorage wrapper
// ===============================

function storageGet(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (e) {
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // storage unavailable (private mode, quota, etc.) - fail silently
    }
}

// ===============================
// Request counter (rate limit awareness)
// ===============================

function getRequestCounter() {
    const today = new Date().toDateString();
    const stored = JSON.parse(storageGet("requestCounter", "null"));

    if (!stored || stored.date !== today) {
        const fresh = { date: today, count: 0 };
        storageSet("requestCounter", JSON.stringify(fresh));
        return fresh;
    }

    return stored;
}

function incrementRequestCounter() {
    const counter = getRequestCounter();
    counter.count += 1;
    storageSet("requestCounter", JSON.stringify(counter));
    return counter.count;
}

function isRateLimitReached() {
    return getRequestCounter().count >= DAILY_REQUEST_LIMIT;
}

// ===============================
// Debounce utility
// ===============================

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ===============================
// A/B Variant assignment
// ===============================

function getAbVariant() {
    let variant = storageGet("abVariant", null);
    if (variant !== "A" && variant !== "B") {
        variant = Math.random() < 0.5 ? "A" : "B";
        storageSet("abVariant", variant);
    }
    return variant;
}

function getCtaLabel() {
    return getAbVariant() === "A" ? "Read More" : "View Full Story";
}

function trackCtaClick(variant) {
    const key = `abClicks_${variant}`;
    const count = parseInt(storageGet(key, "0"), 10) + 1;
    storageSet(key, String(count));
}

// ===============================
// Loading / Error UI
// ===============================

function setLoading(loading, message) {
    isLoading = loading;

    const indicator = document.getElementById("loadingIndicator");
    const text = document.getElementById("loadingText");
    const getBtn = document.getElementById("getNewsBtn");
    const searchBtn = document.getElementById("searchBtn");

    if (loading) {
        text.textContent = message || "Loading latest news...";
        indicator.classList.remove("hidden");
    } else {
        indicator.classList.add("hidden");
    }

    getBtn.disabled = loading;
    searchBtn.disabled = loading;
}

function showError(message) {
    const errorBox = document.getElementById("errorBox");
    const errorMessage = document.getElementById("errorMessage");
    errorMessage.textContent = message;
    errorBox.classList.remove("hidden");
}

function clearError() {
    document.getElementById("errorBox").classList.add("hidden");
}

function retryLastAction() {
    clearError();
    if (lastAction.type === "search") {
        searchNews({ force: true });
    } else {
        getNews({ force: true });
    }
}

// ===============================
// Load Application
// ===============================

window.onload = function () {

    if (!apiKey) {
        showError("No API key configured. Copy config.example.js to config.js and add your GNews API key.");
        setLoading(false);
        return;
    }

    const savedCategory = storageGet("category", "technology");
    const savedCountry = storageGet("country", "in");
    const savedView = storageGet("view", "card");
    const savedSearch = storageGet("lastSearch", "");

    document.getElementById("category").value = savedCategory;
    document.getElementById("country").value = savedCountry;
    document.getElementById("searchInput").value = savedSearch;

    if (savedView === "chart") {
        document.getElementById("chartSection").style.display = "block";
        document.getElementById("newsContainer").style.display = "none";
    } else {
        document.getElementById("chartSection").style.display = "none";
        document.getElementById("newsContainer").style.display = "grid";
    }

    getAbVariant();

    getNews();

    setInterval(function () {
        if (document.visibilityState === "visible") {
            getNews();
        }
    }, AUTO_REFRESH_INTERVAL);

    setInterval(showFeaturedHeadline, FEATURED_ROTATE_INTERVAL);

};

// ===============================
// Reusable Card
// ===============================

function createNewsCard(article) {

    return `

    <div class="card">

        <img src="${article.image || "https://via.placeholder.com/400x220"}" alt="${article.title}" loading="lazy" onerror="this.onerror=null;this.src='https://via.placeholder.com/400x220';">

        <div class="card-content">

            <h2>${article.title}</h2>

            <p>

                ${article.description || "No description available."}

            </p>

            <p class="source">

                Source : ${article.source.name}

            </p>

            <p class="date">

                ${new Date(article.publishedAt).toLocaleString()}

            </p>

            <a

                href="${article.url}"

                class="readMore"

                target="_blank"

                onclick="trackCtaClick('${getAbVariant()}')">

                ${getCtaLabel()}

            </a>

        </div>

    </div>

    `;

}

function createSkeletonCard() {
    return `
    <div class="card skeleton">
        <div class="skeleton-img"></div>
        <div class="card-content">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
    </div>
    `;
}

function showSkeletonCards(count) {
    const container = document.getElementById("newsContainer");
    let html = "";
    for (let i = 0; i < count; i++) {
        html += createSkeletonCard();
    }
    container.innerHTML = html;
}

// ===============================
// Display News
// ===============================

function displayNews() {

    const container = document.getElementById("newsContainer");

    if (articles.length === 0) {
        container.innerHTML = `<p class="emptyState">No articles found. Try a different category or search term.</p>`;
        return;
    }

    let html = "";

    articles.forEach(article => {
        html += createNewsCard(article);
    });

    container.innerHTML = html;
}

// ===============================
// Dashboard
// ===============================

function updateDashboard() {

    document.getElementById("articleCount").innerHTML = articles.length;

    const uniqueSources = [
        ...new Set(
            articles.map(article => article.source.name)
        )
    ];

    document.getElementById("sourceCount").innerHTML = uniqueSources.length;

    document.getElementById("currentCategory").innerHTML =
        document.getElementById("category").value;

    document.getElementById("lastUpdated").innerHTML =
        new Date().toLocaleTimeString();
}

// ===============================
// Cache helpers
// ===============================

function getCacheKey(type, params) {
    return `${type}:${JSON.stringify(params)}`;
}

function getFromCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_DURATION) return null;
    return entry.data;
}

function saveToCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ===============================
// Shared fetch with error handling
// ===============================

function fetchNews(url) {

    if (activeController) {
        activeController.abort();
    }
    activeController = new AbortController();

    return fetch(url, { signal: activeController.signal })
        .then(response => {
            if (response.status === 429) {
                throw new Error("RATE_LIMIT");
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error("AUTH_ERROR");
            }
            if (!response.ok) {
                throw new Error("HTTP_ERROR");
            }
            return response.json();
        })
        .then(data => {
            if (data.errors) {
                throw new Error("API_ERROR");
            }
            return data;
        });
}

function resolveErrorMessage(error, cachedFallback) {

    let message;

    if (error.name === "AbortError") {
        return null;
    }

    switch (error.message) {
        case "RATE_LIMIT":
            message = "API rate limit reached. Please try again later.";
            break;
        case "AUTH_ERROR":
            message = "News service authentication failed. Please check the API key.";
            break;
        case "API_ERROR":
            message = "The news service returned an error for this request.";
            break;
        case "HTTP_ERROR":
            message = "Unable to reach the news service right now.";
            break;
        default:
            message = navigator.onLine === false
                ? "You appear to be offline. Check your internet connection."
                : "Something went wrong while fetching news.";
    }

    if (cachedFallback) {
        message += " Showing the most recent available results.";
    }

    return message;
}

// ===============================
// Get News
// ===============================

function getNews(options) {

    options = options || {};
    lastAction = { type: "news" };
    clearError();

    const category = document.getElementById("category").value;
    const country = document.getElementById("country").value;

    storageSet("category", category);
    storageSet("country", country);

    const cacheKey = getCacheKey("news", { category, country });

    if (!options.force) {
        const cached = getFromCache(cacheKey);
        if (cached) {
            articles = cached;
            document.getElementById("status").innerHTML = "";
            displayNews();
            updateDashboard();
            drawChart();
            featuredIndex = 0;
            showFeaturedHeadline();
            return;
        }
    }

    if (isRateLimitReached()) {
        const cached = getFromCache(cacheKey) || articles;
        showError("Daily request limit reached. Showing cached results where available.");
        if (cached.length) {
            articles = cached;
            displayNews();
            updateDashboard();
            drawChart();
        }
        return;
    }

    if (isLoading) return;

    setLoading(true, "Loading latest news...");
    showSkeletonCards(6);

    const url = `https://gnews.io/api/v4/top-headlines?category=${category}&country=${country}&lang=en&max=10&apikey=${apiKey}`;

    incrementRequestCounter();

    fetchNews(url)
        .then(data => {
            articles = data.articles || [];
            saveToCache(cacheKey, articles);
            document.getElementById("status").innerHTML = "";
            displayNews();
            updateDashboard();
            drawChart();
            featuredIndex = 0;
            showFeaturedHeadline();
        })
        .catch(error => {
            const cachedFallback = getFromCache(cacheKey);
            const message = resolveErrorMessage(error, cachedFallback);
            if (message === null) return;

            showError(message);

            if (cachedFallback) {
                articles = cachedFallback;
                displayNews();
                updateDashboard();
                drawChart();
            } else {
                document.getElementById("newsContainer").innerHTML =
                    `<p class="emptyState">No articles could be loaded.</p>`;
            }
        })
        .finally(() => {
            setLoading(false);
        });
}

// ===============================
// Search News
// ===============================

function searchNews(options) {

    options = options || {};

    const keyword = document.getElementById("searchInput").value.trim();

    storageSet("lastSearch", keyword);

    if (keyword === "") {
        getNews();
        return;
    }

    lastAction = { type: "search" };
    clearError();

    const country = document.getElementById("country").value;
    const cacheKey = getCacheKey("search", { keyword, country });

    if (!options.force) {
        const cached = getFromCache(cacheKey);
        if (cached) {
            articles = cached;
            document.getElementById("status").innerHTML = "";
            displayNews();
            updateDashboard();
            drawChart();
            featuredIndex = 0;
            showFeaturedHeadline();
            return;
        }
    }

    if (isRateLimitReached()) {
        showError("Daily request limit reached. Please try again tomorrow.");
        return;
    }

    if (isLoading) return;

    setLoading(true, "Searching news...");
    showSkeletonCards(6);

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=${country}&max=10&apikey=${apiKey}`;

    incrementRequestCounter();

    fetchNews(url)
        .then(data => {
            articles = data.articles || [];
            saveToCache(cacheKey, articles);
            document.getElementById("status").innerHTML = "";
            displayNews();
            updateDashboard();
            drawChart();
            featuredIndex = 0;
            showFeaturedHeadline();
        })
        .catch(error => {
            const cachedFallback = getFromCache(cacheKey);
            const message = resolveErrorMessage(error, cachedFallback);
            if (message === null) return;

            showError(message);

            if (cachedFallback) {
                articles = cachedFallback;
                displayNews();
                updateDashboard();
                drawChart();
            } else {
                document.getElementById("newsContainer").innerHTML =
                    `<p class="emptyState">No results found for "${keyword}".</p>`;
            }
        })
        .finally(() => {
            setLoading(false);
        });
}

const debouncedSearch = debounce(function () {
    searchNews();
}, SEARCH_DEBOUNCE_DELAY);

// ===============================
// Featured Headline
// ===============================

function showFeaturedHeadline() {

    if (articles.length === 0) {
        document.getElementById("featuredNews").innerHTML = "No news available.";
        return;
    }

    if (featuredIndex >= articles.length) {
        featuredIndex = 0;
    }

    const article = articles[featuredIndex];

    document.getElementById("featuredNews").innerHTML = `
        <h3>${article.title}</h3>
        <br>
        <p>${article.description || ""}</p>
    `;

    featuredIndex++;
}

// ===============================
// Chart.js
// ===============================

function drawChart() {

    if (newsChart) {
        newsChart.destroy();
        newsChart = null;
    }

    if (articles.length === 0) {
        return;
    }

    const sourceCount = {};

    articles.forEach(article => {
        const source = article.source.name;
        sourceCount[source] = (sourceCount[source] || 0) + 1;
    });

    const labels = Object.keys(sourceCount);
    const values = Object.values(sourceCount);

    const ctx = document.getElementById("newsChart").getContext("2d");

    newsChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Articles by Source",
                data: values,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

// ===============================
// Card View
// ===============================

function showCardView() {
    document.getElementById("newsContainer").style.display = "grid";
    document.getElementById("chartSection").style.display = "none";
    storageSet("view", "card");
}

// ===============================
// Chart View
// ===============================

function showChartView() {
    document.getElementById("newsContainer").style.display = "none";
    document.getElementById("chartSection").style.display = "block";
    drawChart();
    storageSet("view", "chart");
}

// ===============================
// Chatbot
// ===============================

function chatBot() {

    const chatArea = document.getElementById("chatArea");
    const chatInput = document.getElementById("chatInput");
    const message = chatInput.value.trim();

    if (message === "") return;

    const input = message.toLowerCase();

    chatArea.innerHTML += `<p><b>You :</b> ${message}</p>`;

    if (input === "hi" || input === "hello") {
        chatArea.innerHTML += `<p><b>Bot :</b> Hello! Welcome to the Personalized News Dashboard.</p>`;
    }
    else if (input === "help") {
        chatArea.innerHTML += `
        <p>
        <b>Bot :</b>
        Commands you can use:
        <br><br>
        technology
        <br>
        sports
        <br>
        business
        <br>
        health
        <br>
        science
        <br>
        entertainment
        <br>
        world
        <br>
        nation
        <br>
        general
        <br>
        chart
        <br>
        cards
        <br>
        latest
        <br>
        search AI
        </p>
        `;
    }
    else if (
        ["technology", "sports", "business", "science",
            "health", "entertainment", "general",
            "nation", "world"].some(category => input.includes(category))
    ) {
        const matchedCategory = ["technology", "sports", "business", "science",
            "health", "entertainment", "general",
            "nation", "world"].find(category => input.includes(category));
        document.getElementById("category").value = matchedCategory;
        chatArea.innerHTML += `<p><b>Bot :</b> Showing ${matchedCategory} news.</p>`;
        getNews();
    }
    else if (input === "chart") {
        showChartView();
        chatArea.innerHTML += `<p><b>Bot :</b> Switched to Chart View.</p>`;
    }
    else if (input === "cards") {
        showCardView();
        chatArea.innerHTML += `<p><b>Bot :</b> Switched to Card View.</p>`;
    }
    else if (input === "latest") {
        chatArea.innerHTML += `<p><b>Bot :</b> Fetching the latest headlines...</p>`;
        getNews();
    }
    else if (input.startsWith("search ")) {
        const keyword = message.substring(7);
        document.getElementById("searchInput").value = keyword;
        chatArea.innerHTML += `<p><b>Bot :</b> Searching for <b>${keyword}</b>.</p>`;
        searchNews();
    }
    else {
        chatArea.innerHTML += `<p><b>Bot :</b> Sorry, I don't understand that. Type <b>help</b> to see available commands.</p>`;
    }

    chatInput.value = "";
    chatArea.scrollTop = chatArea.scrollHeight;
}

// ===============================
// Event Listeners
// ===============================

document.getElementById("searchInput")
    .addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            searchNews();
        }
    });

document.getElementById("searchInput")
    .addEventListener("input", debouncedSearch);

document.getElementById("chatInput")
    .addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            chatBot();
        }
    });

document.getElementById("category")
    .addEventListener("change", function () {
        getNews();
    });

document.getElementById("country")
    .addEventListener("change", function () {
        getNews();
    });

window.addEventListener("offline", function () {
    document.getElementById("getNewsBtn").disabled = true;
    document.getElementById("searchBtn").disabled = true;
    showError("You are offline. Reconnect to fetch new articles.");
});

window.addEventListener("online", function () {
    if (!isLoading) {
        document.getElementById("getNewsBtn").disabled = false;
        document.getElementById("searchBtn").disabled = false;
    }
    clearError();
});