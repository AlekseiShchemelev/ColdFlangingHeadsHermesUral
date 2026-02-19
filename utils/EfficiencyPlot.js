// EfficiencyPlot.js – график эффективности (столбчатая диаграмма)

class EfficiencyPlot {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  update(labels, data, label) {
    if (this.chart) this.chart.destroy();

    // Расчёт среднего значения для линии нормы
    const avgValue =
      data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;

    this.chart = new Chart(this.ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: label,
            data: data,
            backgroundColor: data.map((v) =>
              v >= avgValue
                ? "rgba(34, 197, 94, 0.7)"
                : "rgba(59, 130, 246, 0.7)",
            ),
            borderRadius: 6,
            borderWidth: 0,
          },
          {
            type: "line",
            label: "Среднее",
            data: Array(labels.length).fill(avgValue),
            borderColor: "#f59e0b",
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.type === "line") {
                  return `Среднее: ${ctx.raw.toFixed(2)} м`;
                }
                return `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} м`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#e2e8f0" },
            title: {
              display: true,
              text: "Метры (м)",
              font: { size: 11 },
            },
          },
          x: {
            grid: { display: false },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
      },
    });
  }
}
