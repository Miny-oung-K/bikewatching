import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken =
  'pk.eyJ1IjoibWlrMDYxIiwiYSI6ImNtaHgwdWlkdzAxbGoybHBzajFuNjZjbnkifQ.65SJlBgyZ7AJ7DQTZdxSrA';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Helper: convert station lon/lat → pixel coords on the map
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point);
  return { cx: x, cy: y }; 
}

let timeFilter = -1;

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat(); // No filtering, return all trips
  }

  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  // Handle time filtering across midnight
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

function computeStationTraffic(stations, timeFilter = -1) {
  // Retrieve filtered trips efficiently
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id
  );

  // Update station data with filtered counts
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}


// Convert Date → minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

map.on('load', async () => {
  console.log('Map loaded');

  // -------------------------
  // Boston bike lanes source
  // -------------------------
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  });

  // ----------------------------
  // Cambridge bike lanes source
  // ----------------------------
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'bike-lanes-cambridge',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 4,
      'line-opacity': 0.7,
    },
  });

  // SVG overlay inside #map
  const svg = d3.select('#map').select('svg');

  // These need to be visible to updateScatterPlot
  let stations;
  let trips;
  let radiusScale;
  let circles;

  // ----------------------------
  // Load stations + trips and create circles
  // ----------------------------
  try {
    // Load stations JSON
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);

    console.log('Loaded JSON Data:', jsonData);

    stations = jsonData.data.stations;
    console.log('Stations Array:', stations);

    // Load trips CSV and parse dates
    trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);

        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        departuresByMinute[startedMinutes].push(trip);
        arrivalsByMinute[endedMinutes].push(trip); // ← this is the TODO

        return trip;
      }
    );


    // Compute initial station traffic using all trips
    stations = computeStationTraffic(stations);
    console.log('Stations with traffic:', stations);

    // Radius scale based on totalTraffic
    radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    // Append circles to the SVG for each station (keyed by short_name)
    circles = svg
      .selectAll('circle')
      .data(stations, (d) => d.short_name)
      .enter()
      .append('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .each(function (d) {
        d3.select(this)
          .append('title')
          .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
          );
      });

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
      circles
        .attr('cx', (d) => getCoords(d).cx) // x-position
        .attr('cy', (d) => getCoords(d).cy); // y-position
    }

    // Initial position when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
  } catch (error) {
    console.error('Error loading JSON:', error);
  }

  // --- Step 5.2 & 5.3: Reactivity for the time slider ---

  // Select slider and display elements (inside map.on)
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  // Update the UI + trigger filtering
  function updateTimeDisplay() {
    let currentFilter = Number(timeSlider.value); // Get slider value

    if (currentFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(currentFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }

    // Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(currentFilter);
  }

  // Step 5.3: update scatterplot based on timeFilter
  function updateScatterPlot(currentFilter) {
    if (!stations || !radiusScale || !circles) return;

    // Recompute station traffic based on timeFilter only
    const filteredStations = computeStationTraffic(stations, currentFilter);

    // Adjust radius range depending on filtering
    currentFilter === -1
      ? radiusScale.range([0, 25])
      : radiusScale.range([3, 50]);

    circles
      .data(filteredStations, (d) => d.short_name) // keep the key
      .join('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic));
  }


  // Update immediately and whenever slider moves
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();
});
