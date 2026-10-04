(() => {
  const config = window.CLIMBING_CONFIG || {};
  const configured =
    config.supabaseUrl?.startsWith("http") &&
    !config.supabasePublishableKey?.startsWith("PASTE");

  const $ = selector => document.querySelector(selector);

  const grades = [
    "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a",
    "7a+", "7b", "7b+", "7c", "7c+", "8a"
  ];

  const TABLE_PAGE_SIZE = 30;
let tablePage = 1;

  const baseScores = Object.fromEntries(
    grades.map((grade, index) => [grade, 600 + index * (100 / 6)])
  );

  let supabase;
  let sends = [];
  let charts = [];

  const readOnly = window.CLIMBING_READ_ONLY === true;

  const sendScore = send =>
    baseScores[send.grade] + ({ RP: 0, FL: 10, OS: 15 }[send.ascent_type] || 0);

  const isValid = send => {
    const sentDate = new Date(send.sent_on + "T00:00:00");
    const daysOld = Math.floor((Date.now() - sentDate) / 86400000);
    return daysOld <= 180;
  };

  /* skip first few months in chart. Use date format YYYY-MM-DD */
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
  });

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
