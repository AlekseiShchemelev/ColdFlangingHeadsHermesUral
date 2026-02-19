// DefectPie.js – круговая диаграмма брака

class DefectPie {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(labels, data, label) {
    if (this.chart) this.chart.destroy();

    // Фильтрация только тех, у кого есть брак
    const nonZeroIndices = data
      .map((v, i) => (v > 0 ? i : -1))
      .filter((i) => i >= 0);
    const filteredLabels = nonZeroIndices.map((i) => labels[i]);
    const filteredData = nonZeroIndices.map((i) => data[i]);

    if (filteredData.length === 0) {
      // Если нет брака, показываем сообщение
      this.chart = new Chart(this.ctx, {
        type: "doughnut",
        data: {
          labels: ["Нет брака"],
          datasets: [
            {
              data: [100],
              backgroundColor: ["#22c55e"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
        },
      });
      return;
    }

    this.chart = new Chart(this.ctx, {
      type: "doughnut",
      data: {
        labels: filteredLabels,
        datasets: [
          {
            data: filteredData,
            backgroundColor: [
              "#3b82f6",
              "#ef4444",
              "#eab308",
              "#22c55e",
              "#a855f7",
              "#ec4899",
              "#14b8a6",
              "#f97316",
              "#6b7280",
              "#8b5cf6",
              "#0ea5e9",
              "#84cc16",
              "#f43f5e",
              "#64748b",
              "#d946ef",
            ],
            borderWidth: 2,
            borderColor: "#ffffff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 12,
              font: { size: 10 },
              padding: 10,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((ctx.raw / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.raw.toFixed(2)}% (${percentage}% от общего брака)`;
              },
            },
          },
        },
        cutout: "50%",
      },
    });
  }
}
