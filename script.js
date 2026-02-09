"use strict";

const form = document.querySelector(".form");
const containerWorkouts = document.querySelector(".workouts");
const inputType = document.querySelector(".form__input--type");
const inputDistance = document.querySelector(".form__input--distance");
const inputDuration = document.querySelector(".form__input--duration");
const inputCadence = document.querySelector(".form__input--cadence");
const inputElevation = document.querySelector(".form__input--elevation");

const btnDeleteAll = document.querySelector(".options__delete-all");
const btnSort = document.querySelector(".options__sort");
const btnShowAll = document.querySelector(".options__show-all");

class Workout {
  date = new Date();
  id = (Date.now() + "").slice(-10);
  constructor(coords, distance, duration) {
    this.coords = coords;
    this.distance = distance;
    this.duration = duration;
  }

  _setDescription() {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }
}

// running class
class Running extends Workout {
  type = "running";
  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

// cycling class
class Cycling extends Workout {
  type = "cycling";
  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.CalcSpeed();
    this._setDescription();
  }

  CalcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

class App {
  #map;
  #mapEvent;
  #workouts = [];
  #editingId = null;
  #markers = new Map();
  #sortedByDistance = false;
  #tempCoords = [];
  #tempLine = null;
  #polylines = new Map();
  #isDrawing = false;

  constructor() {
    // get data from localStorge
    this._getLocalStorage();

    this._getPosition();
    form.addEventListener("submit", this._newWorkout.bind(this));
    inputType.addEventListener("change", this._toggleElevationField);
    // containerWorkouts.addEventListener("click", this._moveToPopup.bind(this));
    // containerWorkouts.addEventListener("click", this._startEdit.bind(this));
    containerWorkouts.addEventListener(
      "click",
      this._handleWorkoutClick.bind(this)
    );
    document.addEventListener("keydown", this._cancelEdit.bind(this));
    btnDeleteAll.addEventListener("click", this._deleteAllWorkouts.bind(this));
    btnSort.addEventListener("click", this._sortWorkouts.bind(this));
    btnShowAll.addEventListener("click", this._showAllWorkouts.bind(this));
  }

  _getPosition() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert("Could not get your position");
        }
      );
    }
  }

  _loadMap(position) {
    console.log(position);
    const { latitude } = position.coords;
    const { longitude } = position.coords;
    console.log(`https://www.google.com/maps/@${latitude},${longitude}`);

    const coords = [latitude, longitude];

    // 1) Create map and set view
    this.#map = L.map("map").setView(coords, 13);

    // 2) Add tile layer (map "skin")
    L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Click on map - marker

    this.#map.on("click", this._showForm.bind(this));

    // render markers for stored workouts (after map exists)
    this.#workouts.forEach((work) => this.renderWorkoutMarker(work));
    this.#workouts.forEach((work) => this._renderWorkoutPath(work));

    this._showAllWorkouts();
  }

  _showForm(mapE) {
    const { lat, lng } = mapE.latlng;

    // START NEW ROUTE
    if (!this.#isDrawing) {
      this._resetDraftRoute();
      this.#isDrawing = true;
      this.#mapEvent = mapE;

      // start coords
      this.#tempCoords = [[lat, lng]];

      form.classList.remove("hidden");
      inputDistance.focus();
      return;
    }

    // EXTEND EXISTING ROUTE
    this.#tempCoords.push([lat, lng]);

    if (!this.#tempLine) {
      this.#tempLine = L.polyline(this.#tempCoords, {
        className: `route-preview ${inputType.value}-route`,
      }).addTo(this.#map);
    } else {
      this.#tempLine.setLatLngs(this.#tempCoords);
    }
  }

  _hideForm() {
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        "";
    form.style.display = "none";
    form.classList.add("hidden");
    setTimeout(() => (form.style.display = "grid"), 1000);
  }

  _toggleElevationField() {
    inputElevation.closest(".form__row").classList.toggle("form__row--hidden");
    inputCadence.closest(".form__row").classList.toggle("form__row--hidden");
  }

  _newWorkout(e) {
    e.preventDefault();

    // helpers
    const validInputs = (...inputs) =>
      inputs.every((inp) => Number.isFinite(inp));

    const allPositive = (...inputs) => inputs.every((inp) => inp > 0);

    const hasValue = (...fields) =>
      fields.every((inp) => inp.value.trim() !== "");

    // get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    // =====================
    // VALIDATION
    // =====================
    if (type === "running") {
      const cadence = +inputCadence.value;

      if (!hasValue(inputDistance, inputDuration, inputCadence))
        return alert("Please fill in all required fields!");

      if (
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return alert("Inputs have to be positive numbers!");
    }

    if (type === "cycling") {
      const elevation = +inputElevation.value;

      if (!hasValue(inputDistance, inputDuration, inputElevation))
        return alert("Please fill in all required fields!");

      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration)
      )
        return alert("Inputs have to be positive numbers!");
    }

    // =====================
    // CREATE vs EDIT
    // =====================
    if (this.#editingId) {
      this._updateWorkout(type, distance, duration);
    } else {
      this._createWorkout(type, distance, duration);
    }

    // reset UI + state
    this._hideFormAndClear();
    this._setLocalStorage();
  }

  renderWorkoutMarker(workout) {
    // Remove existing marker for this workout (useful for edits)
    const existing = this.#markers.get(workout.id);
    if (existing) this.#map.removeLayer(existing);

    // Create and store marker
    const marker = L.marker(workout.coords[0])
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === "running" ? "🏃‍" : "🚴‍"} ${workout.description}`
      )
      .openPopup();

    this.#markers.set(workout.id, marker);
  }

  _renderWorkout(workout) {
    let html = `
        <li class="workout workout--${workout.type} " data-id="${workout.id}">
            <div class='workout__header'>
                <h2 class="workout__title">${workout.description}</h2>
                <div class='buttons'>
                 <button class="workout__edit">🖊 Edit</button>
                 <button class="workout__delete">❌ Delete</button>
                 </div>
            </div>
          <div class="workout__details">
            <span class="workout__icon">${
              workout.type === "running" ? "🏃‍" : "🚴‍"
            }️</span>
            <span class="workout__value">${workout.distance}</span>
            <span class="workout__unit">km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⏱</span>
            <span class="workout__value">${workout.duration}</span>
            <span class="workout__unit">min</span>
          </div> 
    `;
    if (workout.type === "running") {
      html += `
          <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${workout.pace.toFixed(1)}</span>
            <span class="workout__unit">min/km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">🦶🏼</span>
            <span class="workout__value">${workout.cadence}</span>
            <span class="workout__unit">spm</span>
          </div>
        </li>

        `;
    }

    if (workout.type === "cycling") {
      html += `
                      <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${workout.speed.toFixed(1)}</span>
            <span class="workout__unit">km/h</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⛰</span>
            <span class="workout__value">${workout.elevationGain}</span>
            <span class="workout__unit">m</span>
          </div>
        </li>
            `;
    }
    form.insertAdjacentHTML("afterend", html);
  }

  _moveToPopup(e) {
    const workoutEl = e.target.closest(".workout");
    if (!workoutEl) return;

    const workout = this.#workouts.find(
      (work) => work.id === workoutEl.dataset.id
    );

    if (!workout) return;

    this.#map.setView(workout.coords[0], 13, {
      animate: true,
      pan: { duration: 1 },
    });
  }

  _setLocalStorage() {
    localStorage.setItem("workouts", JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem("workouts"));

    if (!data) return;

    this.#workouts = data.map((obj) => this._rebuildWorkout(obj));

    // render list items (sidebar)
    this._rerenderWorkoutsList(this.#workouts);
    // console.log(this.#workouts[0].constructor.name);
  }

  reset() {
    localStorage.removeItem("workouts");
    location.reload();
  }

  _startEdit(e) {
    if (!e.target.closest(".workout__edit")) return;

    const workoutEl = e.target.closest(".workout");
    if (!workoutEl) return;

    const workout = this.#workouts.find((w) => w.id === workoutEl.dataset.id);
    if (!workout) return;

    containerWorkouts.querySelectorAll(".workout").forEach((el) => {
      el.classList.remove(
        "workout--editing-running",
        "workout--editing-cycling"
      );
    });
    workoutEl.classList.add(
      workout.type === "running"
        ? "workout--editing-running"
        : "workout--editing-cycling"
    );

    // set edit mode
    this.#editingId = workout.id;

    // show form
    form.classList.remove("hidden");

    // set type + toggle fields if needed
    inputType.value = workout.type;
    this._toggleElevationFieldForType(workout.type);

    // prefill common fields
    inputDistance.value = workout.distance;
    inputDuration.value = workout.duration;

    // prefill type-specific
    if (workout.type === "running") {
      inputCadence.value = workout.cadence;
      inputElevation.value = "";
    } else {
      inputElevation.value = workout.elevationGain;
      inputCadence.value = "";
    }

    inputDistance.focus();
  }

  _toggleElevationFieldForType(type) {
    const cadenceRow = inputCadence.closest(".form__row");
    const elevRow = inputElevation.closest(".form__row");

    if (type === "running") {
      cadenceRow.classList.remove("form__row--hidden");
      elevRow.classList.add("form__row--hidden");
    }
    if (type === "cycling") {
      elevRow.classList.remove("form__row--hidden");
      cadenceRow.classList.add("form__row--hidden");
    }
  }

  _createWorkout(type, distance, duration) {
    // ⛔ samo create koristi map click
    if (!this.#tempCoords.length) return;

    // const { lat, lng } = this.#mapEvent.latlng;
    let workout;

    if (type === "running") {
      const cadence = +inputCadence.value;
      workout = new Running(this.#tempCoords, distance, duration, cadence);
    }

    if (type === "cycling") {
      const elevation = +inputElevation.value;
      workout = new Cycling(this.#tempCoords, distance, duration, elevation);
    }

    // store
    this.#workouts.push(workout);

    // render
    this.renderWorkoutMarker(workout);
    this._renderWorkout(workout);
    this._renderWorkoutPath(workout);
    this._resetDraftRoute();

    // this.#tempCoords = [];
    // if (this.#tempLine) {
    //   this.#map.removeLayer(this.#tempLine);
    //   this.#tempLine = null;
    // }

    // reset map click (optional but clean)
    // this.#mapEvent = null;
  }

  _updateWorkout(type, distance, duration) {
    const workout = this.#workouts.find((w) => w.id === this.#editingId);
    if (!workout) return;

    // update common fields
    workout.type = type; // ako dozvoljavaš promjenu type-a
    workout.distance = distance;
    workout.duration = duration;

    // update type-specific + recalc
    if (type === "running") {
      workout.cadence = +inputCadence.value;
      workout.pace = workout.duration / workout.distance;
      delete workout.elevationGain;
      delete workout.speed;
    }

    if (type === "cycling") {
      workout.elevationGain = +inputElevation.value;
      workout.speed = workout.distance / (workout.duration / 60);
      delete workout.cadence;
      delete workout.pace;
    }

    // update marker (coords ostaju iste u edit verziji)
    this.renderWorkoutMarker(workout);

    // update sidebar: najlakše je rerender cijelu listu (za sada)
    this._rerenderWorkoutsList();

    this._resetDraftRoute();

    // exit edit mode
    this.#editingId = null;
  }

  _rerenderWorkoutsList(workouts = this.#workouts) {
    // obriši sve li osim forme (forma je u listi)
    const items = containerWorkouts.querySelectorAll(".workout");
    items.forEach((el) => el.remove());

    workouts.forEach((w) => this._renderWorkout(w));
  }

  _hideFormAndClear() {
    form.classList.add("hidden");
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        "";

    containerWorkouts
      .querySelectorAll(".workout")
      .forEach((el) =>
        el.classList.remove(
          "workout--editing-running",
          "workout--editing-cycling"
        )
      );
  }

  _handleWorkoutClick(e) {
    if (e.target.closest(".workout__delete")) {
      this._deleteWorkout(e);
      return;
    }

    if (e.target.closest(".workout__edit")) {
      this._startEdit(e);
      return;
    }

    if (this.#editingId) return;

    if (e.target.closest(".workout")) {
      this._moveToPopup(e);
    }
  }

  _cancelEdit(e) {
    if (e.key !== "Escape") return;
    if (!this.#editingId) return;

    // exit edit mode
    this.#editingId = null;

    // hide form + clear inputs + remove highlight
    this._hideFormAndClear();
    this._resetDraftRoute();
  }

  _deleteWorkout(e) {
    if (!confirm("Delete this workout?")) return;
    const workoutEl = e.target.closest(".workout");
    if (!workoutEl) return;

    const id = workoutEl.dataset.id;

    // ako brišemo workout koji je u edit modu → cancel edit
    if (this.#editingId === id) {
      this.#editingId = null;
      this._hideFormAndClear();
    }

    // 1) ukloni iz niza
    this.#workouts = this.#workouts.filter((w) => w.id !== id);

    // 2) ukloni marker sa mape
    const marker = this.#markers.get(id);
    if (marker) {
      this.#map.removeLayer(marker);
      this.#markers.delete(id);
    }

    // 3) ukloni polyline
    const line = this.#polylines.get(id);
    if (line) {
      this.#map.removeLayer(line);
      this.#polylines.delete(id);
    }

    // 4) ukloni element iz DOM-a
    workoutEl.remove();

    // 5) update localStorage
    this._setLocalStorage();
  }

  _deleteAllWorkouts() {
    const ok = confirm("Delete all workouts? This action cannot be undone.");
    if (!ok) return;

    this.reset();
  }

  _sortWorkouts() {
    // ako trenutno NIJE sortirano → prikaži distance DESC
    if (!this.#sortedByDistance) {
      const sorted = this.#workouts
        .slice()
        .sort((a, b) => a.distance - b.distance);

      this._rerenderWorkoutsList(sorted);
      this.#sortedByDistance = true;
      return;
    }

    // ako JESTE sortirano → vrati originalni redoslijed (vrijeme kreiranja)
    this._rerenderWorkoutsList(this.#workouts);
    this.#sortedByDistance = false;
  }

  _rebuildWorkout(obj) {
    const { coords, distance, duration } = obj;
    let workout;

    if (obj.type === "running") {
      workout = new Running(coords, distance, duration, obj.cadence);
    }

    if (obj.type === "cycling") {
      workout = new Cycling(coords, distance, duration, obj.elevationGain);
    }

    // restore original meta (id/date)
    workout.id = obj.id;
    workout.date = new Date(obj.date);

    // ensure description matches restored date/type
    workout._setDescription();

    return workout;
  }

  _showAllWorkouts() {
    if (!this.#workouts.length) return;

    const allPoints = this.#workouts.flatMap((w) => w.coords);
    const bounds = L.latLngBounds(allPoints);

    this.#map.fitBounds(bounds, {
      padding: [50, 50],
      animate: true,
    });
  }

  _renderWorkoutPath(workout) {
    const existing = this.#polylines.get(workout.id);
    if (existing) this.#map.removeLayer(existing);

    const line = L.polyline(workout.coords, {
      className: `${workout.type}-route`,
    }).addTo(this.#map);

    this.#polylines.set(workout.id, line);
  }

  _resetDraftRoute() {
    this.#tempCoords = [];

    if (this.#tempLine) {
      this.#map.removeLayer(this.#tempLine);
      this.#tempLine = null;
    }

    this.#mapEvent = null;
    this.#isDrawing = false;
  }
}

const app = new App();
