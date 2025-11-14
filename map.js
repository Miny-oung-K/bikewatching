// Import D3 as an ES module
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
// Import Mapbox as an ES module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken =
  'pk.eyJ1IjoibWlrMDYxIiwiYSI6ImNtaHgwdWlkdzAxbGoybHBzajFuNjZjbnkifQ.65SJlBgyZ7AJ7DQTZdxSrA';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude] - Boston/Cambridge area
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

// Helper: convert station lon/lat → pixel coords on the map
function getCoords(station) {
  if (!Number.isFinite(station.lon) || !Number.isFinite(station.lat)) {
    return { cx: -9999, cy: -9999 }; // place it far off-screen
  }

  const point = new mapboxgl.LngLat(station.lon, station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// NOW your map.on('load') block:
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
      'line-color': '#32D400', // bright green
      'line-width': 5,
      'line-opacity': 0.5,
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
      'line-opacity': 0.5,
    },
  });

  // ⭐ Step 3.2: select the SVG overlay inside #map
  const svg = d3.select('#map').select('svg');

  // ----------------------------
  // Step 3.1 + 3.3: Load stations and add circles
  // ----------------------------
  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);

    console.log('Loaded JSON Data:', jsonData);

    // Extract stations array
    const rawStations = jsonData.data.stations;
    console.log('Stations Array:', rawStations);

    let stations = rawStations;

    // Step 4.1: load traffic CSV
    const trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv'
    );

    // Step 4.2: roll up departures and arrivals
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id
    );

    // Add arrivals, departures, totalTraffic to each station
    stations = stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;       // TODO filled
      station.totalTraffic = station.arrivals + station.departures; // TODO filled
      return station;
    });

    console.log('Stations with traffic:', stations);

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);


    // Append circles to the SVG for each station
    const circles = svg
      .selectAll('circle')
      .data(stations)
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
        .attr('cx', d => getCoords(d).cx) // x-position
        .attr('cy', d => getCoords(d).cy); // y-position
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
  
  const slider = document.getElementById('time-slider');
  const timeDisplay = document.getElementById('time-display');
  const anyTime = document.getElementById('time-any');

  // Convert minutes → HH:MM AM/PM
  function formatTime(mins) {
    const d = new Date(0, 0, 0, 0, mins);
    return d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // Update the time display as slider moves
  slider.addEventListener('input', () => {
    const value = +slider.value;

    if (value === -1) {
      // (-1) means no filtering
      timeDisplay.textContent = '';
      anyTime.style.display = 'block';
    } else {
      // Show time and hide "(any time)"
      timeDisplay.textContent = formatTime(value);
      anyTime.style.display = 'none';
    }
  });

});
