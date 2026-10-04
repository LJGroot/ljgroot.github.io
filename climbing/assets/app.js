// This immediately invoked function expression (IIFE) creates a private scope.
// Variables declared inside it do not become global variables on `window`.
(() => {
  // Read the configuration object added by config.js. `|| {}` means:
  // use an empty object when CLIMBING_CONFIG is missing.
  const config = window.CLIMBING_CONFIG || {};

  // Optional chaining (`?.`) avoids an error when a property is absent.
  // Both conditions must be true before Supabase can be used.
  const configured =
    config.supabaseUrl?.startsWith("http") &&
    !config.supabasePublishableKey?.startsWith("PASTE");

  // Small helper: `$()` returns the first element matching a CSS selector.
  // Example: $("#search") selects the element with id="search".
  const $ = selector => document.querySelector(selector);

  // Ordered grade scale. Its order is also used for score calculation and comparisons.
  const grades = [
    "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a",
    "7a+", "7b", "7b+", "7c", "7c+", "8a"
  ];

  // Number of table rows shown on one pagination page.
  const TABLE_PAGE_SIZE = 30;

  // Mutable state: the currently visible page in the send table.
  let tablePage = 1;

  // Build an object that maps every grade to a numerical base score.
  // `map()` creates [key, value] pairs; Object.fromEntries() turns them into an object.
  const baseScores = Object.fromEntries(
    grades.map((grade, index) => [grade, 600 + index * (100 / 6)])
  );

  // Variables filled later, after the app has initialised.
  let supabase;
  let sends = [];
  let charts = [];

  // The public dashboard sets CLIMBING_READ_ONLY to true in its HTML.
  const readOnly = window.CLIMBING_READ_ONLY === true;

  // Calculate a send's score: grade base score plus ascent-type bonus.
  // `|| 0` supplies zero if an unexpected ascent type is encountered.
  const sendScore = send =>
    baseScores[send.grade] +
    ({ RP: 0, FL: 10, OS: 15 }[send.ascent_type] || 0);

  // A send remains valid for 180 days after its recorded date.
  const isValid = send => {
    // Adding a time avoids inconsistent parsing of a YYYY-MM-DD date string.
    const sentDate = new Date(send.sent_on + "T00:00:00");
    const daysOld = Math.floor((Date.now() - sentDate) / 86400000);

    // `<=` includes sends exactly 180 days old.
    return daysOld <= 180;
  };

  // Hide early history in the progression chart. Use ISO date format: YYYY-MM-DD.
  const PROGRESS_START_DATE = "2023-10-01";

  // Format a database date for display, e.g. "05 Oct 2026".
  const formatDate = date =>
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(date + "T00:00:00"));

  // Return the grade whose base score is nearest to a numerical score.
  function nearestGrade(score) {
    // Start with the first grade as the current best candidate.
    let bestGrade = grades[0];
    let smallestDifference = Infinity;

    // `for...of` iterates over every value in the grades array.
    for (const grade of grades) {
      const difference = Math.abs(baseScores[grade] - score);

      // Replace the current result when this grade is closer.
      if (difference < smallestDifference) {
        bestGrade = grade;
        smallestDifference = difference;
      }
    }

    return bestGrade;
  }

  // Convert text to safe HTML before inserting it with innerHTML.
  // This prevents route and gym text from being interpreted as HTML.
  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  // Create a reusable diagonal-stripe CanvasPattern for lead-climbing chart bars.
  function stripedPattern(baseColor) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    // This small canvas tile is repeated by Chart.js.
    canvas.width = 10;
    canvas.height = 10;

    // Paint the coloured background first.
    context.fillStyle = baseColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw semi-transparent white diagonal lines over it.
    context.strokeStyle = "rgba(255, 255, 255, 0.75)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-2, 10);
    context.lineTo(10, -2);
    context.moveTo(2, 12);
    context.lineTo(12, 2);
    context.stroke();

    // Return a repeatable pattern that Chart.js accepts as a background colour.
    return context.createPattern(canvas, "repeat");
  }

  // Fetch all sends needed by this version of the dashboard.
  async function loadSends() {
    // Public visitors use the restricted view; admins use the private table.
    const tableName = readOnly ? "public_sends" : "sends";

    // Object destructuring extracts `data` and `error` from the Supabase response.
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("sent_on", { ascending: false });

    // Stop when Supabase reports an error.
    if (error) {
      alert(error.message);
      return;
    }

    // Store fetched rows. `|| []` guarantees an array when data is null.
    sends = data || [];
    render();
  }

  // Recalculate summary cards, then redraw the table and charts.
  function render() {
    const validSends = sends.filter(isValid);

    // `[...validSends]` copies the array so sorting does not reorder validSends.
    const topTen = [...validSends]
      .sort((a, b) => sendScore(b) - sendScore(a))
      .slice(0, 10);

    // Average the available top valid sends, then map the score back to a grade.
    const currentLevel = topTen.length
      ? nearestGrade(
          topTen.reduce((sum, send) => sum + sendScore(send), 0) /
            topTen.length
        )
      : "–";

    // After descending score sorting, the first send is the hardest one.
    const hardest = topTen[0];

    // Count all sends at 7a or above, including expired sends.
    const hardSendCount = sends.filter(send =>
      grades.indexOf(send.grade) >= grades.indexOf("7a")
    ).length;

    // Count the same grade threshold for sends dated in 2026.
    const goalCount = sends.filter(send =>
      send.sent_on.startsWith("2026") &&
      grades.indexOf(send.grade) >= grades.indexOf("7a")
    ).length;

    // Write the calculated values into the summary-card elements.
    $("#valid-sends").textContent = validSends.length;
    $("#current-level").textContent = currentLevel;
    $("#hardest-send").textContent = hardest
      ? `${hardest.grade} ${hardest.ascent_type}`
      : "–";
    $("#hardest-detail").textContent = hardest
      ? `${hardest.route || "Unnamed route"} · ${hardest.gym_crag}`
      : "";
    $("#hard-send-count").textContent = hardSendCount;
    $("#goal-progress").textContent = `${goalCount} / 16`;

    renderTable();
    renderCharts(validSends);
  }

  // Filter, sort, paginate, and render the send-log table.
  function renderTable() {
    // Read the active search term and ascent-type filter from the page.
    const query = $("#search").value.toLowerCase();
    const type = $("#type-filter").value;

    // Copy sends, apply filters, and sort newest date first.
    const shown = [...sends]
      .filter(send => !type || send.ascent_type === type)
      .filter(send =>
        [send.gym_crag, send.route, send.grade]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .sort((a, b) => b.sent_on.localeCompare(a.sent_on));

    // Always keep at least one logical page, even when no rows match.
    const totalPages = Math.max(1, Math.ceil(shown.length / TABLE_PAGE_SIZE));

    // Keep tablePage within the available range after filtering or deletion.
    tablePage = Math.min(tablePage, totalPages);

    // Convert the one-based page number to a zero-based array position.
    const startIndex = (tablePage - 1) * TABLE_PAGE_SIZE;
    const paginatedSends = shown.slice(
      startIndex,
      startIndex + TABLE_PAGE_SIZE
    );

    // Select pagination controls once for this render.
    const pagination = $("#table-pagination");
    const previousButton = $("#table-prev");
    const nextButton = $("#table-next");
    const pageStatus = $("#table-page-status");

    // Do not show pagination when every row fits on the first page.
    pagination.hidden = shown.length <= TABLE_PAGE_SIZE;
    previousButton.disabled = tablePage === 1;
    nextButton.disabled = tablePage === totalPages;
    pageStatus.textContent = `Page ${tablePage} of ${totalPages}`;

    // Use a conditional expression: rows when there are results, otherwise one message row.
    $("#send-rows").innerHTML = shown.length
      ? paginatedSends.map(send => `
        <tr>
          <td>${formatDate(send.sent_on)}</td>
          <td>${escapeHtml(send.gym_crag)}</td>
          <td>${escapeHtml(send.route || "—")}</td>
          <td>${send.grade}</td>
          <td>${send.ascent_type}</td>
          <td>${escapeHtml(send.style || "—")}</td>
          <td>${sendScore(send).toFixed(0)}</td>
          <td>
            <span class="badge ${isValid(send) ? "valid" : "expired"}">
              ${isValid(send) ? "Yes" : "No"}
            </span>
          </td>
          <td><button class="secondary edit" data-id="${send.id}">Edit</button></td>
        </tr>
      `).join("")
      : `<tr><td colspan="9">No sends match the filters.</td></tr>`;

    // Table HTML was just recreated, so attach an edit action to each new Edit button.
    document.querySelectorAll(".edit").forEach(button => {
      button.onclick = () => {
        const send = sends.find(item => String(item.id) === button.dataset.id);
        openDialog(send);
      };
    });
  }

  // Destroy old chart instances and create the three current charts.
  function renderCharts(validSends) {
    charts.forEach(chart => chart.destroy());
    charts = [];

    // Copy and order sends from oldest to newest for historical calculations.
    const chronological = [...sends].sort((a, b) =>
      a.sent_on.localeCompare(b.sent_on)
    );

    // Each unique send date becomes a possible point on the progression chart.
    const progressDates = [...new Set(
      chronological.map(send => send.sent_on)
    )].filter(date => date >= PROGRESS_START_DATE);

    // Calculate the historical top-ten average at every displayed date.
    const progressLevels = progressDates.map(referenceDate => {
      const reference = new Date(referenceDate + "T00:00:00");

      // Keep sends from the 180-day window ending on the reference date.
      const validAtThatTime = chronological.filter(send => {
        const sendDate = new Date(send.sent_on + "T00:00:00");
        const daysDifference = Math.floor((reference - sendDate) / 86400000);
        return daysDifference >= 0 && daysDifference <= 180;
      });

      // Select the ten highest-scoring sends in that historical window.
      const topTenAtThatTime = validAtThatTime
        .sort((a, b) => sendScore(b) - sendScore(a))
        .slice(0, 10);

      // Chart.js interprets null as no value for that point.
      if (!topTenAtThatTime.length) {
        return null;
      }

      // Return the mean score of the available top sends.
      return topTenAtThatTime.reduce(
        (total, send) => total + sendScore(send),
        0
      ) / topTenAtThatTime.length;
    });

    // Create the progression line chart and keep its instance for later destruction.
    charts.push(new Chart($("#progress-chart"), {
      type: "line",
      data: {
        labels: progressDates.map(formatDate),
        datasets: [{
          label: "Average top 10 valid sends",
          data: progressLevels,
          borderColor: "#0d6b64",
          backgroundColor: "#0d6b6420",
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            suggestedMin: 683,
            ticks: {
              callback: value => nearestGrade(value)
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: context => {
                const score = context.raw;
                return `Average top 10: ${nearestGrade(score)} (${score.toFixed(1)})`;
              }
            }
          }
        }
      }
    }));

    // Chart colours encode ascent type.
    const ascentTypes = [
      { key: "RP", label: "RP", color: "#0d6b64" },
      { key: "FL", label: "FL", color: "#8dbdb3" },
      { key: "OS", label: "OS", color: "#e8b766" }
    ];

    // Fill texture encodes climbing style: LD striped, TR solid.
    const ropeStyles = [
      { key: "LD", label: "LD" },
      { key: "TR", label: "TR" }
    ];

    // Create nested counters: grade -> ascent type -> climbing style.
    const pyramidCounts = Object.fromEntries(
      grades.map(grade => [
        grade,
        Object.fromEntries(
          ascentTypes.map(ascentType => [
            ascentType.key,
            { LD: 0, TR: 0 }
          ])
        )
      ])
    );

    // Count all sends for the grade pyramid. Missing style defaults to TR.
    sends.forEach(send => {
      const style = send.style || "TR";

      if (
        pyramidCounts[send.grade] &&
        pyramidCounts[send.grade][send.ascent_type] &&
        pyramidCounts[send.grade][send.ascent_type][style] !== undefined
      ) {
        pyramidCounts[send.grade][send.ascent_type][style]++;
      }
    });

    // The pyramid begins at 7a and is displayed hardest grade first.
    const pyramidGrades = grades
      .filter(grade => grades.indexOf(grade) >= grades.indexOf("7a"))
      .reverse();

    // flatMap creates one chart dataset for each ascent-type/style combination.
    const pyramidDatasets = ascentTypes.flatMap(ascentType =>
      ropeStyles.map(ropeStyle => ({
        label: `${ascentType.label} · ${ropeStyle.label}`,
        data: pyramidGrades.map(
          grade => pyramidCounts[grade][ascentType.key][ropeStyle.key]
        ),
        backgroundColor: ropeStyle.key === "LD"
          ? stripedPattern(ascentType.color)
          : ascentType.color,
        borderColor: ascentType.color,
        borderWidth: 1
      }))
    );

    // Create the stacked horizontal grade-pyramid chart.
    charts.push(new Chart($("#pyramid-chart"), {
      type: "bar",
      data: {
        labels: pyramidGrades,
        datasets: pyramidDatasets
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0 },
            title: { display: true, text: "Number of sends" }
          },
          y: {
            stacked: true,
            title: { display: true, text: "Grade" }
          }
        },
        plugins: {
          legend: { display: true, position: "top" },
          tooltip: { mode: "index", intersect: false }
        }
      }
    }));

    // The two datasets for the valid-sends-by-grade chart.
    const styles = [
      {
        key: "LD",
        label: "LD",
        backgroundColor: stripedPattern("#8dbdb3"),
        borderColor: "#5f9f94"
      },
      {
        key: "TR",
        label: "TR",
        backgroundColor: "#8dbdb3",
        borderColor: "#5f9f94"
      }
    ];

    // Create grade -> style counters, initially all zero.
    const gradeStyleCounts = Object.fromEntries(
      grades.map(grade => [grade, { LD: 0, TR: 0 }])
    );

    // Count only currently valid sends for this chart.
    validSends.forEach(send => {
      const style = send.style || "TR";

      if (
        gradeStyleCounts[send.grade] &&
        gradeStyleCounts[send.grade][style] !== undefined
      ) {
        gradeStyleCounts[send.grade][style]++;
      }
    });

    // Create the stacked valid-sends-by-grade chart.
    charts.push(new Chart($("#grade-chart"), {
      type: "bar",
      data: {
        labels: grades,
        datasets: styles.map(style => ({
          label: style.label,
          data: grades.map(grade => gradeStyleCounts[grade][style.key]),
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderWidth: 1
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        },
        plugins: {
          legend: { display: true, position: "top" }
        }
      }
    }));
  }

  // Open the add/edit dialog. A missing argument means a new send.
  function openDialog(send = null) {
    $("#send-form").reset();
    $("#send-id").value = send?.id || "";
    $("#dialog-title").textContent = send ? "Edit send" : "Add send";
    $("#sent-on").value = send?.sent_on || new Date().toISOString().slice(0, 10);
    $("#gym-crag").value = send?.gym_crag || "";
    $("#route").value = send?.route || "";
    $("#grade").value = send?.grade || "6a";
    $("#ascent-type").value = send?.ascent_type || "RP";
    $("#style").value = send?.style || "TR";
    $("#form-message").textContent = "";
    $("#send-dialog").showModal();
  }

  // Parse the simple CSV format used by the import control.
  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines.shift().split(",").map(value => value.trim());

    return lines
      .filter(line => line.trim())
      .map(line => {
        const values = line
          .split(",")
          .map(value => value.trim().replace(/^"|"$/g, ""));

        return Object.fromEntries(
          headers.map((header, index) => [header, values[index] || ""])
        );
      })
      .filter(item =>
        item.gym_crag &&
        item.sent_on &&
        item.grade &&
        item.ascent_type
      )
      .map(item => ({
        gym_crag: item.gym_crag,
        sent_on: item.sent_on,
        route: item.route || "",
        grade: item.grade,
        ascent_type: item.ascent_type.toUpperCase()
      }));
  }

  // Read a selected CSV file, validate its rows, and insert them into Supabase.
  async function importCsv(file) {
    const text = await file.text();
    const rows = parseCsv(text);

    if (!rows.length) {
      alert("No valid rows were found. Check the expected CSV column names.");
      return;
    }

    const { error } = await supabase.from("sends").insert(rows);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`${rows.length} sends imported.`);
    await loadSends();
  }

  // Reveal the application and load data after public access or authentication succeeds.
  async function showApp(session = null) {
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");

    if (readOnly) {
      $("#welcome").textContent = "Public read-only dashboard";
      $("#sign-out").style.display = "none";
    } else {
      $("#welcome").textContent = session.user.email;
      $("#sign-out").style.display = "";
    }

    await loadSends();
  }

  // Set up controls, Supabase, public mode, and admin authentication.
  async function initialise() {
    // Populate the grade select field from the single grade list.
    $("#grade").innerHTML = grades.map(grade =>
      `<option value="${grade}">${grade}</option>`
    ).join("");

    // Show setup guidance instead of attempting a connection without configuration.
    if (!configured) {
      $("#setup").classList.remove("hidden");
      return;
    }

    // Create the Supabase browser client using the public project credentials.
    supabase = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey
    );

    if (readOnly) {
      // Public dashboard: no authentication is required.
      await showApp();
    } else {
      // Admin page: restore an existing session, or reveal the login form.
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await showApp(session);
      } else {
        $("#auth").classList.remove("hidden");
      }

      // Handle password login without allowing the browser's normal form submission.
      $("#login-form").onsubmit = async event => {
        event.preventDefault();

        const { error } = await supabase.auth.signInWithPassword({
          email: $("#email").value,
          password: $("#password").value
        });

        $("#auth-message").textContent = error ? error.message : "";

        if (!error) {
          const { data: { session: newSession } } =
            await supabase.auth.getSession();
          await showApp(newSession);
        }
      };
    }

    // Sign out and reload so the admin page returns to its login state.
    $("#sign-out").onclick = async () => {
      await supabase.auth.signOut();
      location.reload();
    };

    if (readOnly) {
      // Remove write-only controls from the public dashboard.
      $("#new-send").style.display = "none";
      document.querySelector(".file-button").style.display = "none";
    } else {
      // Admin-only controls for adding one send or importing CSV rows.
      $("#new-send").onclick = () => openDialog();
      $("#csv-import").onchange = async event => {
        const file = event.target.files[0];
        if (file) await importCsv(file);
        event.target.value = "";
      };
    }

    // Close buttons share the same dialog-closing action.
    $("#close-dialog").onclick = () => $("#send-dialog").close();
    $("#cancel-dialog").onclick = () => $("#send-dialog").close();

    // A changed filter starts again on page one before redrawing the table.
    $("#search").addEventListener("input", () => {
      tablePage = 1;
      renderTable();
    });

    $("#type-filter").addEventListener("change", () => {
      tablePage = 1;
      renderTable();
    });

    // Pagination listeners are attached exactly once during initialisation.
    $("#table-prev").addEventListener("click", () => {
      if (tablePage > 1) {
        tablePage--;
        renderTable();
      }
    });

    $("#table-next").addEventListener("click", () => {
      tablePage++;
      renderTable();
    });

    // Save either an edited row or a new row, depending on whether an id exists.
    $("#send-form").onsubmit = async event => {
      event.preventDefault();

      const id = $("#send-id").value;
      const item = {
        sent_on: $("#sent-on").value,
        gym_crag: $("#gym-crag").value.trim(),
        route: $("#route").value.trim(),
        grade: $("#grade").value,
        ascent_type: $("#ascent-type").value,
        style: $("#style").value
      };

      const result = id
        ? await supabase.from("sends").update(item).eq("id", id)
        : await supabase.from("sends").insert(item);

      if (result.error) {
        $("#form-message").textContent = result.error.message;
        return;
      }

      $("#send-dialog").close();
      await loadSends();
    };
  }

  // Start the application once this script has been loaded.
  initialise();
})();
  const PROGRESS_START_DATE = "2023-10-01";
  
  const formatDate = date =>
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(date + "T00:00:00"));

  function nearestGrade(score) {
    let bestGrade = grades[0];
    let smallestDifference = Infinity;

    for (const grade of grades) {
      const difference = Math.abs(baseScores[grade] - score);
      if (difference < smallestDifference) {
        bestGrade = grade;
        smallestDifference = difference;
      }
    }

    return bestGrade;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function stripedPattern(baseColor) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = 10;
  canvas.height = 10;

  context.fillStyle = baseColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.75)";
  context.lineWidth = 2;

  context.beginPath();
  context.moveTo(-2, 10);
  context.lineTo(10, -2);
  context.moveTo(2, 12);
  context.lineTo(12, 2);
  context.stroke();

  return context.createPattern(canvas, "repeat");
}

async function loadSends() {
  const tableName = readOnly ? "public_sends" : "sends";

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .order("sent_on", { ascending: false });

  if (error) {
    alert(error.message);
    return;
  }

  sends = data || [];
  render();
}

  function render() {
    const validSends = sends.filter(isValid);
    const topTen = [...validSends]
      .sort((a, b) => sendScore(b) - sendScore(a))
      .slice(0, 10);

    const currentLevel = topTen.length
      ? nearestGrade(topTen.reduce((sum, send) => sum + sendScore(send), 0) / topTen.length)
      : "–";

    const hardest = topTen[0];

    const hardSendCount = sends.filter(send =>
    grades.indexOf(send.grade) >= grades.indexOf("7a")
    ).length;
    
    const goalCount = sends.filter(send =>
      send.sent_on.startsWith("2026") &&
      grades.indexOf(send.grade) >= grades.indexOf("7a")
    ).length;

    $("#valid-sends").textContent = validSends.length;
    $("#current-level").textContent = currentLevel;
    $("#hardest-send").textContent = hardest
      ? `${hardest.grade} ${hardest.ascent_type}`
      : "–";
    $("#hardest-detail").textContent = hardest
      ? `${hardest.route || "Unnamed route"} · ${hardest.gym_crag}`
      : "";
    $("#hard-send-count").textContent = hardSendCount;
    $("#goal-progress").textContent = `${goalCount} / 16`;

    renderTable();
    renderCharts(validSends);
  }

  function renderTable() {
  const query = $("#search").value.toLowerCase();
  const type = $("#type-filter").value;

  const shown = [...sends]
    .filter(send => !type || send.ascent_type === type)
    .filter(send =>
      [send.gym_crag, send.route, send.grade]
        .join(" ")
        .toLowerCase()
        .includes(query)
    )
    .sort((a, b) => b.sent_on.localeCompare(a.sent_on));

  const totalPages = Math.max(
    1,
    Math.ceil(shown.length / TABLE_PAGE_SIZE)
  );

  tablePage = Math.min(tablePage, totalPages);

  const startIndex = (tablePage - 1) * TABLE_PAGE_SIZE;
  const paginatedSends = shown.slice(
    startIndex,
    startIndex + TABLE_PAGE_SIZE
  );

  const pagination = $("#table-pagination");
  const previousButton = $("#table-prev");
  const nextButton = $("#table-next");
  const pageStatus = $("#table-page-status");

  pagination.hidden = shown.length <= TABLE_PAGE_SIZE;

  previousButton.disabled = tablePage === 1;
  nextButton.disabled = tablePage === totalPages;

  pageStatus.textContent = `Page ${tablePage} of ${totalPages}`;

  $("#send-rows").innerHTML = shown.length
    ? paginatedSends.map(send => `
      <tr>
        <td>${formatDate(send.sent_on)}</td>
        <td>${escapeHtml(send.gym_crag)}</td>
        <td>${escapeHtml(send.route || "—")}</td>
        <td>${send.grade}</td>
        <td>${send.ascent_type}</td>
        <td>${escapeHtml(send.style || "—")}</td>
        <td>${sendScore(send).toFixed(0)}</td>
        <td>
          <span class="badge ${isValid(send) ? "valid" : "expired"}">
            ${isValid(send) ? "Yes" : "No"}
          </span>
        </td>
        <td><button class="secondary edit" data-id="${send.id}">Edit</button></td>
      </tr>
    `).join("")
    : `<tr><td colspan="9">No sends match the filters.</td></tr>`;

  document.querySelectorAll(".edit").forEach(button => {
    button.onclick = () => {
      const send = sends.find(item => String(item.id) === button.dataset.id);
      openDialog(send);
    };
  });
}

  function renderCharts(validSends) {
    charts.forEach(chart => chart.destroy());
    charts = [];

const chronological = [...sends].sort((a, b) =>
  a.sent_on.localeCompare(b.sent_on)
);

/*
  For every date with a logged send:
  1. Look back 180 days from that date.
  2. Keep ascents that were valid on that date.
  3. Select the ten highest scores.
  4. Calculate their mean score.

  This produces a historical version of the workbook's
  "average top 10 valid ascents" level.
*/
    
const progressDates = [...new Set(
  chronological.map(send => send.sent_on)
)].filter(date => date >= PROGRESS_START_DATE);

const progressLevels = progressDates.map(referenceDate => {
  const reference = new Date(referenceDate + "T00:00:00");

  const validAtThatTime = chronological.filter(send => {
    const sendDate = new Date(send.sent_on + "T00:00:00");
    const daysDifference = Math.floor(
      (reference - sendDate) / 86400000
    );

    return daysDifference >= 0 && daysDifference <= 180;
  });

  const topTenAtThatTime = validAtThatTime
    .sort((a, b) => sendScore(b) - sendScore(a))
    .slice(0, 10);

  if (!topTenAtThatTime.length) {
    return null;
  }

  return topTenAtThatTime.reduce(
  (total, send) => total + sendScore(send),
  0
) / topTenAtThatTime.length;

charts.push(new Chart($("#progress-chart"), {
  type: "line",
  data: {
    labels: progressDates.map(formatDate),
    datasets: [{
      label: "Average top 10 valid sends",
      data: progressLevels,
      borderColor: "#0d6b64",
      backgroundColor: "#0d6b6420",
      tension: 0.25,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        suggestedMin: 683,
        ticks: {
          callback: value => nearestGrade(value)
        }
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: context => {
            const score = context.raw;
            return `Average top 10: ${nearestGrade(score)} (${score.toFixed(1)})`;
          }
        }
      }
    }
  }
}));

    const ascentTypes = [
  {
    key: "RP",
    label: "RP",
    color: "#0d6b64"
  },
  {
    key: "FL",
    label: "FL",
    color: "#8dbdb3"
  },
  {
    key: "OS",
    label: "OS",
    color: "#e8b766"
  }
];

const ropeStyles = [
  {
    key: "LD",
    label: "LD"
  },
  {
    key: "TR",
    label: "TR"
  }
];

const pyramidCounts = Object.fromEntries(
  grades.map(grade => [
    grade,
    Object.fromEntries(
      ascentTypes.map(ascentType => [
        ascentType.key,
        { LD: 0, TR: 0 }
      ])
    )
  ])
);

sends.forEach(send => {
  const style = send.style || "TR";

  if (
    pyramidCounts[send.grade] &&
    pyramidCounts[send.grade][send.ascent_type] &&
    pyramidCounts[send.grade][send.ascent_type][style] !== undefined
  ) {
    pyramidCounts[send.grade][send.ascent_type][style]++;
  }
});

const pyramidGrades = grades
  .filter(grade => grades.indexOf(grade) >= grades.indexOf("7a"))
  .reverse();

const pyramidDatasets = ascentTypes.flatMap(ascentType =>
  ropeStyles.map(ropeStyle => ({
    label: `${ascentType.label} · ${ropeStyle.label}`,
    data: pyramidGrades.map(
      grade => pyramidCounts[grade][ascentType.key][ropeStyle.key]
    ),
    backgroundColor: ropeStyle.key === "LD"
      ? stripedPattern(ascentType.color)
      : ascentType.color,
    borderColor: ascentType.color,
    borderWidth: 1
  }))
);

charts.push(new Chart($("#pyramid-chart"), {
  type: "bar",
  data: {
    labels: pyramidGrades,
    datasets: pyramidDatasets
  },
  options: {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          precision: 0
        },
        title: {
          display: true,
          text: "Number of sends"
        }
      },
      y: {
        stacked: true,
        title: {
          display: true,
          text: "Grade"
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: "top"
      },
      tooltip: {
        mode: "index",
        intersect: false
      }
    }
  }
}));

    const styles = [
  {
    key: "LD",
    label: "LD",
    backgroundColor: stripedPattern("#8dbdb3"),
    borderColor: "#5f9f94"
  },
  {
    key: "TR",
    label: "TR",
    backgroundColor: "#8dbdb3",
    borderColor: "#5f9f94"
  }
];
    
const gradeStyleCounts = Object.fromEntries(
  grades.map(grade => [
    grade,
    { LD: 0, TR: 0 }
  ])
);

validSends.forEach(send => {
  const style = send.style || "TR";

  if (gradeStyleCounts[send.grade] && gradeStyleCounts[send.grade][style] !== undefined) {
    gradeStyleCounts[send.grade][style]++;
  }
});

charts.push(new Chart($("#grade-chart"), {
  type: "bar",
  data: {
    labels: grades,
    datasets: styles.map(style => ({
      label: style.label,
      data: grades.map(grade => gradeStyleCounts[grade][style.key]),
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderWidth: 1
    }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: "top"
      }
    }
  }
}));
  }

  function openDialog(send = null) {
    $("#send-form").reset();
    $("#send-id").value = send?.id || "";
    $("#dialog-title").textContent = send ? "Edit send" : "Add send";
    $("#sent-on").value = send?.sent_on || new Date().toISOString().slice(0, 10);
    $("#gym-crag").value = send?.gym_crag || "";
    $("#route").value = send?.route || "";
    $("#grade").value = send?.grade || "6a";
    $("#ascent-type").value = send?.ascent_type || "RP";
    $("#style").value = send?.style || "TR";
    $("#form-message").textContent = "";
    $("#send-dialog").showModal();
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines.shift().split(",").map(value => value.trim());

    return lines
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(",").map(value => value.trim().replace(/^"|"$/g, ""));
        return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      })
      .filter(item =>
        item.gym_crag &&
        item.sent_on &&
        item.grade &&
        item.ascent_type
      )
      .map(item => ({
        gym_crag: item.gym_crag,
        sent_on: item.sent_on,
        route: item.route || "",
        grade: item.grade,
        ascent_type: item.ascent_type.toUpperCase()
      }));
  }

  async function importCsv(file) {
    const text = await file.text();
    const rows = parseCsv(text);

    if (!rows.length) {
      alert("No valid rows were found. Check the expected CSV column names.");
      return;
    }

    const { error } = await supabase.from("sends").insert(rows);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`${rows.length} sends imported.`);
    await loadSends();
  }

async function showApp(session = null) {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");

  if (readOnly) {
    $("#welcome").textContent = "Public read-only dashboard";
    $("#sign-out").style.display = "none";
  } else {
    $("#welcome").textContent = session.user.email;
    $("#sign-out").style.display = "";
  }

  await loadSends();
}

  async function initialise() {
    $("#grade").innerHTML = grades.map(grade =>
      `<option value="${grade}">${grade}</option>`
    ).join("");

    if (!configured) {
      $("#setup").classList.remove("hidden");
      return;
    }

    supabase = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey
    );

  if (readOnly) {
  // Public dashboard: no login required.
  await showApp();
} else {
  // Admin page: login remains required.
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    await showApp(session);
  } else {
    $("#auth").classList.remove("hidden");
  }

  $("#login-form").onsubmit = async event => {
    event.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email: $("#email").value,
      password: $("#password").value
    });

    $("#auth-message").textContent = error ? error.message : "";

    if (!error) {
      const { data: { session: newSession } } =
        await supabase.auth.getSession();

      await showApp(newSession);
    }
  };
}

    $("#sign-out").onclick = async () => {
      await supabase.auth.signOut();
      location.reload();
    };

if (readOnly) {
  $("#new-send").style.display = "none";
  document.querySelector(".file-button").style.display = "none";
} else {
  $("#new-send").onclick = () => openDialog();

  $("#csv-import").onchange = async event => {
    const file = event.target.files[0];
    if (file) await importCsv(file);
    event.target.value = "";
  };
}

$("#close-dialog").onclick = () => $("#send-dialog").close();
$("#cancel-dialog").onclick = () => $("#send-dialog").close();
    
$("#search").addEventListener("input", () => {
  tablePage = 1;
  renderTable();
});

$("#type-filter").addEventListener("change", () => {
  tablePage = 1;
  renderTable();
});

$("#table-prev").addEventListener("click", () => {
  if (tablePage > 1) {
    tablePage--;
    renderTable();
  }
});

$("#table-next").addEventListener("click", () => {
  tablePage++;
  renderTable();
});
    
    $("#send-form").onsubmit = async event => {
      event.preventDefault();

      const id = $("#send-id").value;

      const item = {
  sent_on: $("#sent-on").value,
  gym_crag: $("#gym-crag").value.trim(),
  route: $("#route").value.trim(),
  grade: $("#grade").value,
  ascent_type: $("#ascent-type").value,
  style: $("#style").value
};
      const result = id
        ? await supabase.from("sends").update(item).eq("id", id)
        : await supabase.from("sends").insert(item);

      if (result.error) {
        $("#form-message").textContent = result.error.message;
        return;
      }

      $("#send-dialog").close();
      await loadSends();
    };
  }

  initialise();
})();
