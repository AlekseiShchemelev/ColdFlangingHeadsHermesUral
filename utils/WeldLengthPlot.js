//WeldLengthPlot.js – график длины швов по сварщикам (мультилинейный)

class WeldLengthPlot {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
  }

  updateMultiLine(labels, datasets, title = "") {
    if (this.chart) this.chart.destroy();

    // Сортировка датасетов по средней величине для лучшей читаемости
    const sortedDatasets = [...datasets].sort((a, b) => {
      const avgA = a.data.reduce((x, y) => x + y, 0) / a.data.length;
      const avgB = b.data.reduce((x, y) => x + y, 0) / b.data.length;
      return avgB - avgA;
    });

    // Показываем только топ-8 сварщиков + "Прочие"
    let displayDatasets = sortedDatasets;
    if (sortedDatasets.length > 8) {
      const top8 = sortedDatasets.slice(0, 8);
      const others = sortedDatasets.slice(8);
      const otherData = labels.map((_, i) =>
        others.reduce((sum, ds) => sum + (ds.data[i] || 0), 0),
      );
      displayDatasets = [
        ...top8,
        {
          label: "Прочие",
          data: otherData,
          borderColor: "#64748b",
          backgroundColor: "#64748b20",
          tension: 0.2,
          fill: false,
          pointRadius: 2,
        },
      ];
    }

    this.chart = new Chart(this.ctx, {
      type: "line",
      data: { labels, datasets: displayDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              font: { size: 10 },
              usePointStyle: true,
              pointStyle: "line",
            },
          },
          title: {
            display: !!title,
            text: title,
            font: { size: 14, weight: "normal" },
            padding: { bottom: 15 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
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
      },
    });
  }
}
