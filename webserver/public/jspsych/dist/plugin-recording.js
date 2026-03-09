let base64blob = "";
let uuid_jsRecording = "";
let selectedDeviceId = null;
/**
 * Utility function for recording audio
 */
var audioRecorder = {
    /** Stores the recorded audio as Blob objects of audio data as the recording continues*/
    audioBlobs: [], /*of type Blob[]*/
    /** Stores the reference of the MediaRecorder instance that handles the MediaStream when recording starts*/
    mediaRecorder: null, /*of type MediaRecorder*/
    /** Stores the reference to the stream currently capturing the audio*/
    streamBeingCaptured: null, /*of type MediaStream*/
    /** Start recording the audio
      * @returns {Promise} - returns a promise that resolves if audio recording successfully started
    */
    start: function () {
        //Feature Detection
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
            //Feature is not supported in browser
            //return a custom error
            return Promise.reject(new Error('mediaDevices API or getUserMedia method is not supported in this browser.'));
        }
        else {
            //Feature is supported in browser                 
            //create an audio stream
            var audioConstraints = selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true;
            return navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
                //returns a promise that resolves to the audio stream
                .then(stream /*of type MediaStream*/ => {

                    var track = stream.getAudioTracks()[0];
                    console.log("Recording with: " + track.label);

                    //save the reference of the stream to be able to stop it when necessary
                    audioRecorder.streamBeingCaptured = stream;

                    //create a media recorder instance by passing that stream into the MediaRecorder constructor
                    audioRecorder.mediaRecorder = new MediaRecorder(stream); /*the MediaRecorder interface of the MediaStream Recording
                        API provides functionality to easily record media*/

                    //clear previously saved audio Blobs, if any
                    audioRecorder.audioBlobs = [];

                    //add a dataavailable event listener in order to store the audio data Blobs when recording
                    audioRecorder.mediaRecorder.addEventListener("dataavailable", event => {
                        //store audio Blob object
                        audioRecorder.audioBlobs.push(event.data);
                    });

                    //start the recording by calling the start method on the media recorder
                    audioRecorder.mediaRecorder.start();
                });

            /* errors are not handled in the API because if its handled and the promise is chained, the .then after the catch will be executed*/
        }
    },
    /** Stop the started audio recording
      * @returns {Promise} - returns a promise that resolves to the audio as a blob file
      */
    stop: function () {
        //return a promise that would return the blob or URL of the recording
        return new Promise(resolve => {
            //save audio type to pass to set the Blob type
            let mimeType = audioRecorder.mediaRecorder.mimeType;

            //listen to the stop event in order to create & return a single Blob object
            audioRecorder.mediaRecorder.addEventListener("stop", () => {
                //create a single blob object, as we might have gathered a few Blob objects that needs to be joined as one
                let audioBlob = new Blob(audioRecorder.audioBlobs, { type: mimeType });
                //let audioBlob = new Blob(audioRecorder.audioBlobs, { type: "audio/mpeg" });
                //resolve promise with the single audio blob representing the recorded audio
                resolve(audioBlob);
            });

            //stop the recording feature
            audioRecorder.mediaRecorder.stop();

            //stop all the tracks on the active stream in order to stop the stream
            audioRecorder.stopStream();

            //reset API properties for next recording
            audioRecorder.resetRecordingProperties();
        });
    },
    /** Cancel audio recording*/
    cancel: function () {
        //stop the recording feature
        audioRecorder.mediaRecorder.stop();

        //stop all the tracks on the active stream in order to stop the stream
        audioRecorder.stopStream();

        //reset API properties for next recording
        audioRecorder.resetRecordingProperties();
    },

    stopStream: function () {
        //stopping the capturing request by stopping all the tracks on the active stream
        audioRecorder.streamBeingCaptured.getTracks() //get all tracks from the stream
            .forEach(track /*of type MediaStreamTrack*/ => track.stop()); //stop each one
    },
    resetRecordingProperties: function () {
        audioRecorder.mediaRecorder = null;
        audioRecorder.streamBeingCaptured = null;

        /*No need to remove event listeners attached to mediaRecorder as
        If a DOM element which is removed is reference-free (no references pointing to it), the element itself is picked
        up by the garbage collector as well as any event handlers/listeners associated with it.
        getEventListeners(audioRecorder.mediaRecorder) will return an empty array of events.*/
    }
}

const sendData = (trial_data) => {
    console.log(trial_data)
    console.log(uuid_jsRecording)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Content-type': 'application/json'
    };
    fetch('/saveTrialData', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            uuid: uuid_jsRecording,
            trial_data: trial_data
        })
    }).then(response => {
        if (response.ok) return response;
        else throw Error(`Server returned ${response.status}: ${response.statusText}`)
    })
        .then(response => console.log(response.text()))
        .catch(err => {
            console.log(err);
        });
};

const sendAudio = (file, trial_index) => {
    //console.log(uuid_jsRecording)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Content-type': 'application/json'
    };
    fetch('/save', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            audio: file,
            uuid: uuid_jsRecording,
            index: trial_index
        })
    }).then(response => {
        if (response.ok) return response;
        else throw Error(`Server returned ${response.status}: ${response.statusText}`)
    })
        .catch(err => {
            console.log(err);
        });
};




function cancelAudioRecording() {
    console.log("Canceling audio...");
    //cancel the recording using the audio recording API
    audioRecorder.cancel();
};

const blobToBase64 = blob => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    return new Promise(resolve => {
        reader.onloadend = () => {
            resolve(reader.result);
        };
    });
};

function stopAudioRecording(trial) {
    //stop the recording using the audio recording API
    //console.log("Stopping Audio Recording...")
    audioRecorder.stop()
        .then(audioAsblob => { //stopping makes promise resolves to the blob file of the recorded audio
            //console.log("stopped with audio Blob:", audioAsblob); 
            blobToBase64(audioAsblob).then(res => {
                base64blob = res;
                sendAudio(res, trial.trial_index)
            });
        })
        .catch(error => {
            //Error handling structure
            switch (error.name) {
                case 'InvalidStateError': //error from the MediaRecorder.stop
                    console.log("An InvalidStateError has occured.");
                    break;
                default:
                    console.log("An error occured with the error name " + error.name);
            };

        });
};

function startAudioRecording() {
    //start recording using the audio recording API
    audioRecorder.start()
        .then(() => { //on success
            PERMISSION_AUDIO = true
            //console.log("Recording Audio...")    
        })
        .catch(error => { //on error
            //No Browser Support Error
            if (error.message.includes("Permission denied")) {
                console.log('Permission denied');
            }
            if (error.message.includes("mediaDevices API or getUserMedia method is not supported in this browser.")) {
                console.log("To record audio, use browsers like Chrome and Firefox.");
            }
        });
}

let speechRecordingObject = {
    'startTime': 0,
    'timeStamps': []
}


/**
 * Create timestamps at each Trial start
 */
const onTrialStartRecording = function (trial) {
    startAudioRecording();
}

const onTrialFinishRecording = function (trial) {
    stopAudioRecording(trial);
}

var jsPsychSpeechRecording = (function (jspsych) {
    "use strict";

    const info = {
        name: "SpeechRecording",
        parameters: {
            start: {
                type: jspsych.ParameterType.BOOL,
                default: undefined,
            }

        },
    };

    class SpeechRecording {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
            this.html_info =
                `
                <div style="display: flex; flex-direction: column; align-items: center; padding: 10px; gap: 10px; max-width: 1100px; margin: auto;">
                    <div style="text-align: center; width: 100%; font-size: 20px;">
                        <p><strong>Microphone Permission</strong></p>
                    </div>
                    <div style="text-align: left; width: 100%;">
                        <p>In our study we want to record your voice. Please give permission to use your microphone by clicking <strong>"Allow"</strong> in the browser prompt.</p>
                    </div>
                </div>
                `;
            this.html_permission_denied =
                `
                <div style="display: flex; flex-direction: column; align-items: center; padding: 10px; gap: 10px; max-width: 1100px; margin: auto;">
                    <div style="text-align: center; width: 100%; font-size: 20px;">
                        <p><strong>Permission Required</strong></p>
                    </div>
                    <div style="text-align: left; width: 100%;">
                        <p>You must give permission to record audio. Please allow the use of your microphone in your browser settings and reload the website.</p>
                    </div>
                </div>
                `;
        }
        trial(display_element, trial) {
            if (trial.start === true) {

                display_element.innerHTML = this.html_info;
                audioRecorder.start()
                    .then(() => {
                        cancelAudioRecording();
                        this.showMicSelector(display_element);
                    })
                    .catch(error => { //on error
                        // Permission not granted
                        if (error.message.includes("Permission denied") || error.message.includes("Permission dismissed")) {
                            console.log('Permission denied');
                            display_element.innerHTML = this.html_permission_denied;
                        }
                        //No Browser Support Error
                        if (error.message.includes("mediaDevices API or getUserMedia method is not supported in this browser.")) {
                            console.log("To record audio, use browsers like Chrome and Firefox.");
                        }
                    });
            }

            if (trial.start === false) {
                const response = confirm("Your voice recording will be saved and sent to our server. Do you want to continue?");
                if (response === true) {
                    this.jsPsych.finishTrial({})
                } else {
                    this.deleteData()
                }

            }
        }

        showMicSelector(display_element) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                var mics = devices.filter(d => d.kind === 'audioinput');
                if (mics.length <= 1) {
                    if (mics.length === 1) selectedDeviceId = mics[0].deviceId;
                    this.createParticipant();
                    return;
                }
                var html = '<div style="display: flex; flex-direction: column; align-items: center; padding: 10px; gap: 10px; max-width: 1100px; margin: auto;">' +
                    '<div style="text-align: center; width: 100%; font-size: 20px;"><p><strong>Select Microphone</strong></p></div>' +
                    '<div style="text-align: center; width: 100%;">' +
                    '<p>Please select the microphone you would like to use:</p>' +
                    '<select id="mic-select" style="font-size:16px;padding:5px;margin:10px 0;">';
                mics.forEach(function(mic, i) {
                    html += '<option value="' + mic.deviceId + '">' + (mic.label || 'Microphone ' + (i + 1)) + '</option>';
                });
                html += '</select><br>' +
                    '<button id="mic-confirm" style="font-size:16px;padding:8px 20px;margin-top:10px;cursor:pointer;">Confirm</button>' +
                    '</div></div>';
                display_element.innerHTML = html;
                var self = this;
                document.getElementById('mic-confirm').addEventListener('click', function() {
                    selectedDeviceId = document.getElementById('mic-select').value;
                    console.log("Selected microphone: " + document.getElementById('mic-select').selectedOptions[0].text);
                    self.createParticipant();
                });
            });
        }

        createParticipant() {
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Content-type': 'application/json'
            };
            speechRecordingObject.startTime = Date.now();
            console.log("Recording Audio...")
            fetch('/createParticipant', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({})
            }).then(response => {
                if (response.ok) {
                    response.json().then(data => {
                        uuid_jsRecording = data.uuid
                        this.jsPsych.finishTrial({})
                    });
                }
                else throw Error(`Server returned ${response.status}: ${response.statusText}`)
            })
                .catch(err => {
                    console.log(err);
                });
        }

        deleteData() {
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Content-type': 'application/json'
            };
            fetch('/delete', {
                method: 'DELETE',
                headers: headers,
                body: JSON.stringify({ uuid: uuid_jsRecording })
            }).then(response => {
                if (response.ok) {
                    cancelAudioRecording();
                    this.jsPsych.finishTrial({})
                }
                else throw Error(`Server returned ${response.status}: ${response.statusText}`)
            })
                .catch(err => {
                    console.log(err);
                });
        }
    }
    SpeechRecording.info = info;

    return SpeechRecording;
})(jsPsychModule);