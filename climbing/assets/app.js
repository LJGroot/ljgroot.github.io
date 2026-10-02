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

  const baseScores = Object.fromEntries(
    grades.map((grade, index) => [grade, 600 + index * (100 / 6)])
  );

  let supabase;
  let sends = [];
  let charts = [];

  const sendScore = send =>
    baseScores[send.grade] + ({ RP: 0, FL: 10, OS: 15 }[send.ascent_type] || 0);

  const isValid = send => {
    const sentDate = new Date(send.sent_on + "T00:00:00");
    const daysOld = Math.floor((Date.now() - sentDate) / 86400000);
    return daysOld <= 180;
  };

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

  async function loadSends() {
    const { data, error } = await supabase
      .from("sends")
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
    $("#goal-progress").textContent = `${goalCount} / 65`;

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

    $("#send-rows").innerHTML = shown.length
      ? shown.map(send => `
        <tr>
          <td>${formatDate(send.sent_on)}</td>
          <td>${escapeHtml(send.gym_crag)}</td>
          <td>${escapeHtml(send.route || "—")}</td>
          <td>${send.grade}</td>
          <td>${send.ascent_type}</td>
          <td>${sendScore(send).toFixed(0)}</td>
          <td>
            <span class="badge ${isValid(send) ? "valid" : "expired"}">
              ${isValid(send) ? "Yes" : "No"}
            </span>
          </td>
          <td><button class="secondary edit" data-id="${send.id}">Edit</button></td>
        </tr>
      `).join("")
      : `<tr><td colspan="8">No sends match the filters.</td></tr>`;

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

    charts.push(new Chart($("#progress-chart"), {
      type: "line",
      data: {
        labels: chronological.map(send => formatDate(send.sent_on)),
        datasets: [{
          label: "Send score",
          data: chronological.map(sendScore),
          borderColor: "#0d6b64",
          backgroundColor: "#0d6b6420",
          tension: 0.25,
          pointRadius: 4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { suggestedMin: 590 } }
      }
    }));

    const counts = Object.fromEntries(grades.map(grade => [grade, 0]));
    validSends.forEach(send => counts[send.grade]++);

    charts.push(new Chart($("#grade-chart"), {
      type: "bar",
      data: {
        labels: grades,
        datasets: [{
          label: "Valid sends",
          data: grades.map(grade => counts[grade]),
          backgroundColor: "#8dbdb3"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
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

  async function showApp(session) {
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#welcome").textContent = session.user.email;
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
        const { data: { session: newSession } } = await supabase.auth.getSession();
        await showApp(newSession);
      }
    };

    $("#sign-out").onclick = async () => {
      await supabase.auth.signOut();
      location.reload();
    };

    $("#new-send").onclick = () => openDialog();
    $("#close-dialog").onclick = () => $("#send-dialog").close();
    $("#cancel-dialog").onclick = () => $("#send-dialog").close();
    $("#search").oninput = renderTable;
    $("#type-filter").onchange = renderTable;

    $("#csv-import").onchange = async event => {
      const file = event.target.files[0];
      if (file) await importCsv(file);
      event.target.value = "";
    };

    $("#send-form").onsubmit = async event => {
      event.preventDefault();

      const id = $("#send-id").value;

      const item = {
        sent_on: $("#sent-on").value,
        gym_crag: $("#gym-crag").value.trim(),
        route: $("#route").value.trim(),
        grade: $("#grade").value,
        ascent_type: $("#ascent-type").value
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
