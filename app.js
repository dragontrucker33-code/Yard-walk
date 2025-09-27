
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
      import {
        getAuth,
        signInWithCustomToken,
        signInAnonymously,
      } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
      import {
        getFirestore,
        doc,
        deleteDoc,
        onSnapshot,
        collection,
        setDoc,
        query,
        orderBy,
      } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
      import {
        getFunctions,
        httpsCallable,
      } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

      const appId =
        typeof __app_id !== "undefined" ? __app_id : "default-app-id";
      const initialAuthToken =
        typeof __initial_auth_token !== "undefined"
          ? __initial_auth_token
          : null;
      const envFirebaseConfig =
        typeof __firebase_config !== "undefined"
          ? JSON.parse(__firebase_config)
          : null;

      const firebaseConfig = envFirebaseConfig || {
        apiKey: "AIzaSyAxHIhsDl7uR2lmcmj9EWy8epX-1uBmrsw",
        authDomain: "yard-walk.firebaseapp.com",
        projectId: "yard-walk",
        storageBucket: "yard-walk.firebasestorage.app",
        messagingSenderId: "633967680523",
        appId: "1:633967680523:web:47f7148b4966a6642e7b0e",
        measurementId: "G-53CN6Q20PF",
      };

      let db;
      let auth;
      let trailersCollectionRef;
      let isAuthenticated = false;
      let editingDocId = null;

      const setUIState = (state) => {
        const addTrailerButton = document.getElementById("add-trailer");
        const openCameraButton = document.getElementById("open-camera");
        const loadingOverlay = document.getElementById("loading-overlay");
        addTrailerButton.disabled = state === "disabled";
        openCameraButton.disabled = state === "disabled";
        addTrailerButton.classList.toggle("disabled", state === "disabled");
        openCameraButton.classList.toggle("disabled", state === "disabled");
        loadingOverlay.style.display = state === "loading" ? "flex" : "none";
      };

      const displayError = (message) => {
        const errorMessageDiv = document.getElementById("error-message");
        errorMessageDiv.style.display = "block";
        errorMessageDiv.textContent = message;
      };

      const hideError = () => {
        const errorMessageDiv = document.getElementById("error-message");
        errorMessageDiv.style.display = "none";
      };

      const resetForm = () => {
        document.getElementById("trailer-number").value = "";
        document.querySelector(
          'input[name="status"][value="Empty"]'
        ).checked = true;
        document.getElementById("needs-fuel").checked = false;
        document.getElementById("red-tagged").checked = false;
        document.getElementById("seasonal").checked = false;
        document.getElementById("pallet-shuttle").checked = false;
        document.getElementById("north-fence-line").value = "None";
        document.getElementById("south-fence-line").value = "None";
        document.getElementById("comment-container").classList.add("hidden");
        document.getElementById("comments").value = "";
        document.getElementById("add-trailer").textContent = "Enter";
        editingDocId = null;
        document
          .querySelectorAll(".trailer-item")
          .forEach((item) => item.classList.remove("editing"));
      };

      const getSortableValue = (trailerData) => {
        const nf = trailerData.northFence;
        const sf = trailerData.southFence;
        const fenceLine = nf !== "None" ? nf : sf;

        if (fenceLine === "None") {
          return [false, "", 0];
        }

        const parts = fenceLine.split(" ");
        if (parts.length === 1 && !isNaN(parts[0])) {
          return [true, "NF", parseInt(parts[0], 10)];
        }

        const numericPart = parts.pop();
        const prefix = parts.join(" ");

        return [true, prefix, parseInt(numericPart, 10)];
      };

      document.addEventListener("DOMContentLoaded", async () => {
        const trailerNumberInput = document.getElementById("trailer-number");
        const needsFuelCheckbox = document.getElementById("needs-fuel");
        const redTaggedCheckbox = document.getElementById("red-tagged");
        const seasonalCheckbox = document.getElementById("seasonal");
        const palletShuttleCheckbox = document.getElementById("pallet-shuttle");
        const northFenceSelect = document.getElementById("north-fence-line");
        const southFenceSelect = document.getElementById("south-fence-line");
        const commentsTextarea = document.getElementById("comments");
        const addTrailerButton = document.getElementById("add-trailer");
        const lastEnteredWindow = document.getElementById(
          "last-entered-window"
        );
        const emptyCountSpan = document.getElementById("empty-count");
        const salvageCountSpan = document.getElementById("salvage-count");
        const fullCountSpan = document.getElementById("full-count");
        const needsFuelCountSpan = document.getElementById("needs-fuel-count");
        const allEmptyTrailersList = document.getElementById(
          "all-empty-trailers-list"
        );
        const allSalvageTrailersList = document.getElementById(
          "all-salvage-trailers-list"
        );
        const allPalletShuttleTrailersList = document.getElementById(
          "all-pallet-shuttle-trailers-list"
        );
        const allSeasonalTrailersList = document.getElementById(
          "all-seasonal-trailers-list"
        );
        const needsFuelList = document.getElementById("needs-fuel-list");
        const openCameraButton = document.getElementById("open-camera");
        const addCommentButton = document.getElementById("add-comment-button");
        const commentContainer = document.getElementById("comment-container");

        // Use a click event listener for the button
        addCommentButton.addEventListener("click", () => {
          commentContainer.classList.toggle("hidden");
        });

        try {
          setUIState("loading");

          const app = initializeApp(firebaseConfig);
          auth = getAuth(app);
          db = getFirestore(app);

          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
          isAuthenticated = true;
          setUIState("enabled");

          trailersCollectionRef = collection(
            db,
            `artifacts/${appId}/public/data/trailers`
          );

          const cameraInput = document.getElementById("camera-input");
          const ocrCanvas = document.getElementById("ocr-canvas");
          const ocrContext = ocrCanvas.getContext("2d");

          // Function to preprocess image for OCR
          const preprocessImage = (imageBitmap) => {
            ocrCanvas.width = imageBitmap.width;
            ocrCanvas.height = imageBitmap.height;
            ocrContext.drawImage(imageBitmap, 0, 0);

            // Example preprocessing: convert to grayscale
            const imageData = ocrContext.getImageData(
              0,
              0,
              ocrCanvas.width,
              ocrCanvas.height
            );
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = avg; // red
              data[i + 1] = avg; // green
              data[i + 2] = avg; // blue
            }
            ocrContext.putImageData(imageData, 0, 0);

            return ocrCanvas.toDataURL();
          };

          if (openCameraButton) {
            openCameraButton.addEventListener("click", () => {
              cameraInput.click(); // Trigger the hidden file input
            });
          }

          cameraInput.addEventListener("change", async (event) => {
            const file = event.target.files[0];
            if (!file) {
              return;
            }

            setUIState("loading");
            hideError();

            try {
              const imageBitmap = await createImageBitmap(file);
              const processedImage = preprocessImage(imageBitmap);

              const {
                data: { text },
              } = await Tesseract.recognize(processedImage, "eng", {
                logger: (m) => console.log(m),
              });

              console.log("OCR Result Text:", text); // Debugging output

              const sixDigitNumberMatch = text.match(/\d{6}/);
              if (sixDigitNumberMatch && sixDigitNumberMatch[0].length === 6) {
                trailerNumberInput.value = sixDigitNumberMatch[0];
                hideError();
              } else {
                displayError("No 6-digit trailer number found in the image.");
              }
            } catch (error) {
              console.error("OCR Error:", error);
              displayError("Failed to process image with OCR.");
            } finally {
              setUIState("enabled");
              cameraInput.value = ""; // Clear the input so change event fires again for same file
            }
          });

          trailerNumberInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTrailerButton.click();
            }
          });

          onSnapshot(
            query(trailersCollectionRef),
            (snapshot) => {
              allEmptyTrailersList.innerHTML = "";
              allSalvageTrailersList.innerHTML = "";
              allPalletShuttleTrailersList.innerHTML = "";
              allSeasonalTrailersList.innerHTML = "";
              needsFuelList.innerHTML = "";
              let emptyCount = 0;
              let salvageCount = 0;
              let fullCount = 0;
              let needsFuelCount = 0;
              let allTrailers = {};

              const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);

              snapshot.forEach((doc) => {
                const trailerData = doc.data();
                if (
                  trailerData.timestamp &&
                  trailerData.timestamp.toDate() < tenHoursAgo
                ) {
                  return;
                }
                allTrailers[doc.id] = trailerData;
              });

              const trailers = Object.keys(allTrailers).map((id) => ({
                id,
                data: allTrailers[id],
              }));

              trailers.sort((a, b) => {
                const a_nf = a.data.northFence !== 'None';
                const b_nf = b.data.northFence !== 'None';
                const a_sf = a.data.southFence !== 'None';
                const b_sf = b.data.southFence !== 'None';

                if (a_nf && !b_nf) return -1;
                if (!a_nf && b_nf) return 1;

                if (a_sf && !b_sf) return -1;
                if (!a_sf && b_sf) return 1;

                const [isAssignedA, prefixA, numA] = getSortableValue(a.data);
                const [isAssignedB, prefixB, numB] = getSortableValue(b.data);

                if (isAssignedA !== isAssignedB) {
                  return isAssignedA - isAssignedB;
                }
                if (prefixA !== prefixB) {
                  return prefixA.localeCompare(prefixB);
                }
                return numA - numB;
              });

              trailers.forEach((trailer) => {
                const trailerData = trailer.data;
                const docId = trailer.id;

                const details = [
                  trailerData.status,
                  trailerData.needsFuel ? "Needs Fuel" : null,
                  trailerData.redTagged ? "Red Tagged" : null,
                  trailerData.seasonal ? "Seasonal" : null,
                  trailerData.palletShuttle ? "Pallet Shuttle" : null,
                  trailerData.northFence !== "None"
                    ? `NF: ${trailerData.northFence}`
                    : null,
                  trailerData.southFence !== "None"
                    ? `SF: ${trailerData.southFence}`
                    : null,
                  trailerData.comments
                    ? `Comments: ${trailerData.comments}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ");

              const createListItem = (docId, trailerData, details) => {
                const listItem = document.createElement("li");
                listItem.className = `trailer-item ${
                  docId === editingDocId ? "editing" : ""
                }`;
                listItem.dataset.docId = docId;
                listItem.dataset.trailerNumber = trailerData.trailerNumber;
                const parkingSpot = trailerData.northFence !== 'None' ? `NF: ${trailerData.northFence}` : trailerData.southFence !== 'None' ? `SF: ${trailerData.southFence}` : '';
                listItem.innerHTML = `
                          <div class="trailer-info">
                              <div class="trailer-number">${trailerData.trailerNumber} ${parkingSpot}</div>
                              <div class="text-sm text-gray-400">${details}</div>
                          </div>
                          <div>
                              <button class="edit-button" data-doc-id="${docId}">
                                  &#9998;
                              </button>
                              <button class="delete-button" data-doc-id="${docId}">
                                  &times;
                              </button>
                          </div>
                      `;
                return listItem;
              };

                if (trailerData.palletShuttle) {
                  const palletShuttleItem = createListItem(
                    docId,
                    trailerData,
                    details
                  );
                  allPalletShuttleTrailersList.appendChild(palletShuttleItem);
                }

                if (trailerData.seasonal) {
                  const seasonalItem = createListItem(
                    docId,
                    trailerData,
                    details
                  );
                  allSeasonalTrailersList.appendChild(seasonalItem);
                }

                if (trailerData.status === "Empty") {
                  emptyCount++;
                  const emptyListItem = createListItem(
                    docId,
                    trailerData,
                    details
                  );
                  allEmptyTrailersList.appendChild(emptyListItem);
                } else if (trailerData.status === "Salvage") {
                  salvageCount++;
                  const salvageListItem = createListItem(
                    docId,
                    trailerData,
                    details
                  );
                  allSalvageTrailersList.appendChild(salvageListItem);
                } else if (trailerData.status === "Full") {
                  fullCount++;
                }

                if (trailerData.needsFuel) {
                  const needsFuelItem = createListItem(
                    docId,
                    trailerData,
                    details
                  );
                  needsFuelItem.classList.add("needs-fuel");
                  needsFuelList.appendChild(needsFuelItem);
                  needsFuelCount++;
                }
              });

              emptyCountSpan.textContent = `Empty: ${emptyCount}`;
              salvageCountSpan.textContent = `Salvage: ${salvageCount}`;
              fullCountSpan.textContent = `Full: ${fullCount}`;
              needsFuelCountSpan.textContent = needsFuelCount;
              setUIState("enabled");

              const addEditAndDeleteListeners = (listElement) => {
                listElement
                  .querySelectorAll(".edit-button")
                  .forEach((button) => {
                    button.addEventListener("click", (event) => {
                      const docId = event.target.dataset.docId;
                      const trailerData = allTrailers[docId];
                      trailerNumberInput.value = trailerData.trailerNumber;
                      document.querySelector(
                        `input[name="status"][value="${trailerData.status}"]`
                      ).checked = true;
                      needsFuelCheckbox.checked = trailerData.needsFuel;
                      redTaggedCheckbox.checked = trailerData.redTagged;
                      seasonalCheckbox.checked = trailerData.seasonal;
                      palletShuttleCheckbox.checked = trailerData.palletShuttle;
                      northFenceSelect.value = "None";
                      southFenceSelect.value = "None";
                      if (trailerData.comments) {
                        commentContainer.classList.remove("hidden");
                        commentsTextarea.value = trailerData.comments;
                      } else {
                        commentContainer.classList.add("hidden");
                        commentsTextarea.value = "";
                      }
                      editingDocId = docId;
                      addTrailerButton.textContent = "Update";
                      document
                        .querySelectorAll(".trailer-item")
                        .forEach((item) => item.classList.remove("editing"));
                      const itemToEdit = document.querySelector(
                        `[data-doc-id="${docId}"]`
                      );
                      if (itemToEdit) {
                        itemToEdit.classList.add("editing");
                      }
                    });
                  });

                listElement
                  .querySelectorAll(".delete-button")
                  .forEach((button) => {
                    button.addEventListener("click", async (event) => {
                      const docId = event.target.dataset.docId;
                      if (docId) {
                        const docRef = doc(trailersCollectionRef, docId);
                        try {
                          await deleteDoc(docRef);
                          resetForm();
                        } catch (e) {
                          console.error("Error deleting document: ", e);
                          displayError(
                            `Failed to delete trailer: ${e.message}`
                          );
                        }
                      }
                    });
                  });
              };

              addEditAndDeleteListeners(allEmptyTrailersList);
              addEditAndDeleteListeners(allSalvageTrailersList);
              addEditAndDeleteListeners(allPalletShuttleTrailersList);
              addEditAndDeleteListeners(allSeasonalTrailersList);
              addEditAndDeleteListeners(needsFuelList);
            },
            (error) => {
              setUIState("enabled");
              displayError(
                "Failed to load trailers. Please check your Firebase rules and database path."
              );
            }
          );

          addTrailerButton.addEventListener("click", async () => {
            hideError();
            if (!isAuthenticated) {
              displayError(
                "You are not authenticated. Please try refreshing the page."
              );
              return;
            }
            const trailerNumber = trailerNumberInput.value.trim();
            if (!trailerNumber) {
              displayError("Please enter a trailer number.");
              return;
            }

            const status = document.querySelector(
              'input[name="status"]:checked'
            ).value;
            const comments = commentsTextarea.value.trim();
            const trailerData = {
              trailerNumber: trailerNumber,
              status: status,
              needsFuel: needsFuelCheckbox.checked,
              redTagged: redTaggedCheckbox.checked,
              seasonal: seasonalCheckbox.checked,
              palletShuttle: palletShuttleCheckbox.checked,
              comments: comments,
              northFence: northFenceSelect.value,
              southFence: southFenceSelect.value,
              timestamp: new Date(),
            };

            const docIdToUse = editingDocId || trailerNumber;
            const docRef = doc(trailersCollectionRef, docIdToUse);

            try {
              await setDoc(docRef, trailerData);
              lastEnteredWindow.textContent = `${
                editingDocId ? "Updated" : "Recently entered"
              }: ${trailerNumber}`;
              lastEnteredWindow.style.display = "block";
              resetForm();
            } catch (e) {
              console.error("Error writing document: ", e);
              displayError(`Failed to save trailer: ${e.message}`);
            }
          });
        } catch (error) {
          setUIState("disabled");
          displayError(
            `Authentication Failed: ${error.message}. Please check your Firebase configuration.`
          );
        }
      });
