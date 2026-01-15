import ApiHelper from './apiHelper.js';

let chartInstance = null;
const ratioMessage = document.getElementById('ratioMessage');
const welcomeMessage = document.getElementById('welcomeMessage');
const logoutButton = document.getElementById('logoutButton');

document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(sessionStorage.getItem('user'));
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  if (welcomeMessage) welcomeMessage.textContent = `Welcome, ${user.username} (${user.role})!`;
  if (logoutButton) logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
    window.location.href = 'login.html';
  });

  await renderChart();
  wireLiveUpdates();
});

async function fetchHostelStats() {
  // Use the same stats source as hostels list
  const resp = await ApiHelper.get('/hostels?includeStats=true');
  const hostels = resp.data || [];
  // Normalize counts
  return hostels.map(h => {
    const name = h.name;
    const totalRooms = h.totalRooms ?? h.numberOfRooms ?? 0;
    const capacityPerRoom = h.capacityPerRoom ?? Math.max(Math.floor((h.totalCapacity ?? h.capacity ?? 0) / (totalRooms || 1)), 0);
    const totalCapacity = h.totalCapacity ?? h.capacity ?? (capacityPerRoom * totalRooms);
    const occupied = h.stats?.occupiedSlots ?? h.occupiedSlots ?? 0;
    const empty = Math.max((h.stats?.emptySlots ?? (totalCapacity - occupied)), 0);
    return { name, totalCapacity, occupied, empty };
  });
}

async function renderChart() {
  try {
    const data = await fetchHostelStats();
    const ctx = document.getElementById('ratioChart');
    if (!ctx) return;

    const labels = data.map(d => d.name);
    const occupied = data.map(d => d.occupied);
    const empty = data.map(d => Math.max(d.totalCapacity - d.occupied, 0));

    // If totals are small (e.g., demo data), scale Y-axis step and grid for clarity
    const maxValue = Math.max(...data.map(d => d.totalCapacity || 0), 0);

    const datasets = [
      {
        label: 'Occupied Students',
        data: occupied,
        backgroundColor: 'rgba(46, 204, 113, 0.9)', // green
        borderColor: 'transparent',
        borderWidth: 0,
        hoverBorderWidth: 0,
        borderRadius: 6,
      },
      {
        label: 'Empty Slots',
        data: empty,
        backgroundColor: 'rgba(231, 76, 60, 0.9)', // red
        borderColor: 'transparent',
        borderWidth: 0,
        hoverBorderWidth: 0,
        borderRadius: 6,
      }
    ];

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets = datasets;
      chartInstance.update();
      return;
    }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 16,
              boxWidth: 12,
              color: '#333'
            }
          },
          title: {
            display: true,
            text: 'Hostel Students Occupancy Ratio',
            padding: { bottom: 8 },
            font: { size: 18, weight: 'bold' },
            color: '#333'
          },
          subtitle: {
            display: true,
            text: 'Student Occupancy Comparison Across Hostels',
            padding: { bottom: 12 },
            font: { size: 12 },
            color: '#666'
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y || 0;
                const total = (ctx.chart.data.datasets || []).reduce((acc, ds) => acc + (ds.data?.[ctx.dataIndex] || 0), 0);
                const pct = total ? ((val / total) * 100).toFixed(0) : 0;
                return `${ctx.dataset.label}: ${val} (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: '#333', font: { weight: '600' } }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: { display: true, text: 'Slots' },
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { color: '#333', precision: 0 }
          }
        },
        datasets: {
          bar: {
            barPercentage: 0.6,
            categoryPercentage: 0.5
          }
        }
      }
    });
  } catch (e) {
    if (ratioMessage) {
      ratioMessage.textContent = 'Failed to load occupancy data';
      ratioMessage.className = 'message error';
    }
  }
}

function wireLiveUpdates() {
  // Update when hostels or students change in other tabs/pages
  window.addEventListener('storage', (e) => {
    if (e.key === 'hostels:updated' || e.key === 'students:updated') {
      renderChart();
    }
  });
  // Update when same-tab code dispatches events
  window.addEventListener('hostelsUpdated', renderChart);
}


