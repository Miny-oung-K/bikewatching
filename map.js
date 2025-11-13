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

    const stations = rawStations;


    // Append circles to the SVG for each station
    const circles = svg
      .selectAll('circle')
      .data(stations)
      .enter()
      .append('circle')
      .attr('r', 5) // Radius of the circle
      .attr('fill', 'steelblue') // Circle fill color
      .attr('stroke', 'white') // Circle border color
      .attr('stroke-width', 1) // Circle border thickness
      .attr('opacity', 0.8); // Circle opacity

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
});
