document.addEventListener("DOMContentLoaded", () => {
    const wallet = document.querySelector(".wallet");

    if (!wallet) {
        console.error("⚠ Wallet element not found. Ensure the element with class 'wallet' exists in the HTML.");
        return;
    }

    console.log("✅ Wallet element found. Initializing WebSocket...");

    // WebSocket connection
    const apiToken = "uT4oMU9WykXTcV4"; // Replace with your actual token
    const appId = 52152;
    const accountNumber = "CR4071525";
    const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${appId}`);

    const statistics = {
        daily: { markup: 0, runs: 0 },
        weekly: { markup: 0, runs: 0 },
        monthly: { markup: 0, runs: 0 },
        currentMonth: 0,
    };

    const dailyData = [];
    let completedRequests = 0;

    ws.onopen = function () {
        console.log("✅ WebSocket connected, authorizing...");
        ws.send(JSON.stringify({ authorize: apiToken }));
    };

    ws.onmessage = function (event) {
        const response = JSON.parse(event.data);
        console.log("🔹 Full API Response:", response);

        if (response.msg_type === "authorize") {
            console.log("✅ Authorization successful!");
            fetchEachDayMarkup();
            fetchMarkupStatistics("daily");
            fetchMarkupStatistics("weekly");
            fetchMarkupStatistics("monthly");
        } else if (response.msg_type === "app_markup_statistics") {
            console.log("📊 Processing app_markup_statistics response...");
            const totalMarkup = response.app_markup_statistics?.total_app_markup_usd ?? 0;
            const totalRuns = response.app_markup_statistics?.total_transactions_count ?? 0;

            // Handle 30-day data
            if (response.req_id >= 1 && response.req_id <= 30) {
                const date = response.echo_req.date_from.split(" ")[0]; // Extract only the date part
                dailyData.push({ date, markup: totalMarkup });
                completedRequests++;

                // Check if all requests are completed
                if (completedRequests === 30) {
                    console.log("📊 All 30-day data fetched:", dailyData);

                    // Sort data by date (ascending)
                    dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));

                    // Render graph
                    renderGraph(dailyData);
                }
            }

            // Handle daily, weekly, and monthly statistics
            if (response.req_id === 100) {
                statistics.daily.markup = totalMarkup;
                statistics.daily.runs = totalRuns;
                console.log("📊 Updated Daily Statistics:", statistics.daily);
            }
            if (response.req_id === 101) {
                statistics.weekly.markup = totalMarkup;
                statistics.weekly.runs = totalRuns;
                console.log("📊 Updated Weekly Statistics:", statistics.weekly);
            }
            if (response.req_id === 102) {
                statistics.monthly.markup = totalMarkup;
                statistics.monthly.runs = totalRuns;
                statistics.currentMonth = totalMarkup;
                console.log("📊 Updated Monthly Statistics:", statistics.monthly);
            }

            updateStatisticsUI();
        }
    };

    ws.onerror = function (error) {
        console.error("⚠ WebSocket Error:", error);
    };

    ws.onclose = function () {
        console.log("🔴 WebSocket disconnected.");
    };

    function fetchEachDayMarkup() {
        const dateRanges = getLast30DaysDateRanges();
        let reqIdCounter = 1; // Start with 1 for unique integer req_id

        dateRanges.forEach(({ date_from, date_to }) => {
            const request = {
                app_markup_statistics: 1,
                date_from,
                date_to,
                loginid: accountNumber,
                req_id: reqIdCounter++, // Use an incrementing integer for req_id
            };

            console.log(`📢 Requesting 30-day data for ${date_from} to ${date_to} with req_id ${request.req_id}...`);
            ws.send(JSON.stringify(request));
        });
    }

    function renderGraph(data) {
        if (!data || data.length === 0) {
            console.warn("⚠ No data provided to renderGraph.");
            return;
        }

        const ctx = document.getElementById("markupGraph").getContext("2d");
        const labels = data.map(entry => entry.date.split(" ")[0]); // Extract only the date part
        const values = data.map(entry => entry.markup); // Markup values for each day

        console.log("📊 Rendering Graph with Labels:", labels);
        console.log("📊 Rendering Graph with Values:", values);

        new Chart(ctx, {
            type: "line", // Use a line graph
            data: {
                labels,
                datasets: [{
                    label: "30 Days Markup",
                    data: values,
                    borderColor: "rgba(54, 162, 235, 1)",
                    backgroundColor: "rgba(54, 162, 235, 0.2)",
                    borderWidth: 2,
                    tension: 0.4, // Smooth curves
                    pointBackgroundColor: "rgba(54, 162, 235, 1)",
                    pointBorderColor: "#fff",
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: "#000", // Changed to a lighter color for better visibility
                            font: {
                                size: 14,
                            },
                        },
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: "#333",
                        titleColor: "#fff",
                        bodyColor: "#fff",
                        borderColor: "#36a2eb",
                        borderWidth: 1,
                    },
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Date",
                            color: "#000", // Changed to a lighter color for better visibility
                            font: {
                                size: 14,
                            },
                        },
                        grid: {
                            display: false,
                        },
                        ticks: {
                            color: "#000", // Changed to a lighter color for better visibility
                        },
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Markup (USD)",
                            color: "#000", // Changed to a lighter color for better visibility
                            font: {
                                size: 14,
                            },
                        },
                        grid: {
                            color: "rgba(255, 255, 255, 0.1)", // Adjusted for better contrast
                        },
                        ticks: {
                            color: "#000", // Changed to a lighter color for better visibility
                        },
                    },
                },
            },
        });
    }

    function getLast30DaysDateRanges() {
        const dateRanges = [];
        const now = new Date();
        for (let i = 0; i < 30; i++) {
            const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 0, 0, 0));
            const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 23, 59, 59));
            dateRanges.push({
                date_from: formatDate(startDate),
                date_to: formatDate(endDate),
            });
        }
        return dateRanges;
    }

    function formatDate(date) {
        return new Date(date.getTime())
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");
    }

    function fetchMarkupStatistics(type) {
        const { date_from, date_to } = getDateRange(type);
        const reqIdMap = { daily: 100, weekly: 101, monthly: 102 };
        const reqId = reqIdMap[type];

        const request = {
            app_markup_statistics: 1,
            date_from,
            date_to,
            loginid: accountNumber,
            req_id: reqId,
        };

        console.log(`📢 Requesting ${type} statistics with req_id ${reqId}...`);
        ws.send(JSON.stringify(request));
    }

    function predictCurrentMonthMarkup() {
        const totalDays = dailyData.length;
        if (totalDays === 0) {
            console.warn("⚠ No data available for prediction.");
            return 0;
        }

        const totalMarkup = dailyData.reduce((sum, entry) => sum + entry.markup, 0);
        const averageDailyMarkup = totalMarkup / totalDays;

        const now = new Date();
        const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
        const predictedMarkup = averageDailyMarkup * daysInMonth;

        console.log("📊 Predicted Current Month Markup:", predictedMarkup);
        return predictedMarkup;
    }

    function updateStatisticsUI() {
        console.log("📊 Updating wallet UI with statistics:", statistics);

        const predictedMarkup = predictCurrentMonthMarkup();

        wallet.innerHTML = `
            <div class="wallet-header">My Wallet</div>
            <div class="current-month">
                Current Month: $${statistics.currentMonth.toFixed(2)}
            </div>
            <div class="predicted-month">
                Predicted Month: $${predictedMarkup.toFixed(2)}
            </div>
            <div class="stat">
                <div class="stat-title">Daily Markup</div>
                <div class="stat-value">$${statistics.daily.markup.toFixed(2)}</div>
                <div class="stat-runs">Transactions: ${statistics.daily.runs}</div>
            </div>
            <div class="stat">
                <div class="stat-title">Weekly Markup</div>
                <div class="stat-value">$${statistics.weekly.markup.toFixed(2)}</div>
                <div class="stat-runs">Transactions: ${statistics.weekly.runs}</div>
            </div>
            <div class="stat">
                <div class="stat-title">Monthly Markup</div>
                <div class="stat-value">$${statistics.monthly.markup.toFixed(2)}</div>
                <div class="stat-runs">Transactions: ${statistics.monthly.runs}</div>
            </div>
        `;
    }

    function getDateRange(type) {
        const now = new Date();
        let startDate, endDate;

        if (type === "daily") {
            startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
            endDate = new Date();
        } else if (type === "weekly") {
            startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay(), 0, 0, 0));
            endDate = new Date();
        } else if (type === "monthly") {
            startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
            endDate = new Date();
        }

        return {
            date_from: formatDate(startDate),
            date_to: formatDate(endDate),
        };
    }
});
