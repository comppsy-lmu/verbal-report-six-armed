// Plugins

var jsPsychSixArmedBandit = (function (jspsych) { 
    'use strict';
  
    const info = {
      name: 'six-armed-bandit',
      description: '',
      parameters: {
        choice_duration: {
          type: jspsych.ParameterType.INT,
          pretty_name: 'Trial duration',
          default: null,
          description: 'Maximum RT'
        },
        feedback_duration: {
          type: jspsych.ParameterType.INT,
          pretty_name: 'Feedback duration',
          default: 1000,
          description: 'Duration of feedback display in ms'
        },
        iti_duration: {
            type: jspsych.ParameterType.INT,
            pretty_name: 'Duration of the inter-trial-interval',
            default: 100,
            description: 'How long the blank screen is displayed between trials in ms'
        },
        canvas_dimensions: {
            type: jspsych.ParameterType.INT,
            default: [800, 400],
            description: 'The dimensions [width, height] of the html canvas on which things are drawn.'
        },
        background_colour: {
            type: jspsych.ParameterType.STRING,
            default: 'white', //#c0c0c0
            description: 'The colour of the background'
        },
        feedback_offset: {
            type: jspsych.ParameterType.INT,
            pretty_name: 'Feedback offset',
            default: [0, 0],
            description: 'Offset [horizontal, vertical] of the centre of the feedback from the centre of the canvas in pixels'
        },
        feedback_dimensions: {
          type: jspsych.ParameterType.INT,
          pretty_name: 'Feedback dimensions',
          default: [300, 150],
          description: 'Feedback image dimensions in pixels [width, height]'
        },
        feedback_offset: {
          type: jspsych.ParameterType.INT,
          pretty_name: 'Feedback offset',
          default: [0, 0],//[270, -200],
          description: 'The offset [horizontal, vertical] of the centre of the feedback from the centre of the canvas in pixels'
        },
        feedback: {
          type: jspsych.ParameterType.STRING,
          default: null
        }

      }
    }

    class SixArmedBanditPlugin {
      
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }
        trial(display_element, trial) {

            // define new HTML, add canvas, and draw a blank background
            const allSections = ['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Section 5', 'Section 6'];
    
            
            const optionLabels = {};
            ['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Section 5', 'Section 6'].forEach(section => {
              optionLabels[section] = currentShuffledLabels;
            });


            function createSectionHTML(sectionLabel) {
                let new_html = `
                  <div class="section">
                    <p><strong>${sectionLabel}</strong></p>
                    <canvas id="canvas-${sectionLabel}" width="400" height="200"></canvas>
                    <div class="button-row">
                `;
                optionLabels[sectionLabel].forEach(label => {
                  new_html += `<button class="choice-btn" data-choice="${sectionLabel}-${label}">${label}</button>`;
                });
                new_html += `</div></div>`;
                return new_html;
              }
              
              let fullHTML = `
              <div id="experiment-container">
              <canvas id="global-info-canvas"></canvas>
              <canvas id="feedback-canvas"></canvas>
              <div class="grid-container">
              `;
              allSections.forEach(sectionLabel => {
                fullHTML += createSectionHTML(sectionLabel);
              });
              fullHTML += `</div></div>`;
              
              display_element.innerHTML = fullHTML;
              
              var canvas = document.getElementById("global-info-canvas");
              var ctx = canvas.getContext("2d");
              const pr = window.devicePixelRatio || 1;
              
              const rect = canvas.getBoundingClientRect();

              canvas.width =  trial.canvas_dimensions[0] * pr;
              canvas.height = trial.canvas_dimensions[1] * pr;

              canvas.style.width = `${trial.canvas_dimensions[0]}px`;
              canvas.style.height = `${trial.canvas_dimensions[1]}px`;

              ctx.scale(pr, pr);
              

              DrawBackground(isPracticePhase);

            
          //container for key responses
          var response = {
            rt: null,
            choice: null,
            click_target: null,
            timestamp: null
          };


          
    /// TRIAL LOOP ///


    function DrawBackground(isPracticePhase) {
      
      const pr = window.devicePixelRatio || 1;

      // canvas.width =  trial.canvas_dimensions[0] * pr;
      // canvas.height = trial.canvas_dimensions[1] * pr;

      // canvas.style.width = `${trial.canvas_dimensions[0]}px`;
      // canvas.style.height = `${trial.canvas_dimensions[1]}px`;

      // draw the background
      ctx.fillStyle = trial.background_colour;
      ctx.fillRect(0, 0, trial.canvas_dimensions[0], trial.canvas_dimensions[1]);

      // draw the progress text
      ctx.font = "28px Arial";
      ctx.fillStyle = "black";
      ctx.textAlign = "center";

      let info_text = "";
      let trial_info = "";
      let additional_info = "";

      if (isPracticePhase && isSeqGen == false && trial.choice_type == "round") { 
        info_text = "Practice: You've got " + (trial.n_trials-counter.trial) + " of " + trial.n_trials + " trials left";
        additional_info = "Click on one option in Section 1.";


      } else if (isPracticePhase == false && isSeqGen == false && isFinalRound == false && trial.choice_type == "round") {
        info_text = "Round " + counter.round + " of " + counter.n_rounds;
        trial_info = "You've got " + (trial.n_trials-counter.trial) + " of " + trial.n_trials + " trials left";
      
      
      } else if (isPracticePhase == false && isSeqGen == true) {
        info_text = "Sequence of Winning Options";
        trial_info = "Trial " + counter.trial + " of " + trial.n_trials;
      
      } else if (isPracticePhase == false && isSeqGen == false && isFinalRound == true && trial.choice_type == "round") {
        info_text = "Round " + counter.n_rounds + " of " + counter.n_rounds;
        trial_info = "You've got " + (trial.n_trials-counter.trial) + " of " + trial.n_trials + " trials left";
      }

      ctx.fillText(info_text, trial.canvas_dimensions[0] / 2, 30);
      ctx.font = "bold 28px Arial";
      ctx.fillText(trial_info, trial.canvas_dimensions[0] / 2, 70);

      // if practice phase, display additional_info
      if (isPracticePhase || trial.choice_type == "prediction") {
        ctx.fillStyle = "black";
        ctx.font = "bold 24px Arial";
        ctx.fillText(additional_info, trial.canvas_dimensions[0] / 2, 70);
      }


    };


    DrawScreen();


    function updateScreen() {
      requestAnimationFrame(() => {
        DrawScreen(ctx);
      });
    } 

    // start the response listener
    const trialStartTime = performance.now();

    

    // document.querySelectorAll('.choice-btn').forEach(oldBtn => {
    //   const newBtn = oldBtn.cloneNode(true); // removes all listeners
    //   oldBtn.replaceWith(newBtn);
    // });
    
    // Now add listener safely to clean buttons
    document.querySelectorAll('.choice-btn').forEach(button => {
      button.addEventListener('click', function (e) {
    
        // Disable all buttons right away
        document.querySelectorAll('.choice-btn').forEach(btn => {
          btn.disabled = true;
          btn.style.pointerEvents = 'none';
        });
    
        const choice = this.getAttribute('data-choice');
        response.choice = choice;
        response.rt = performance.now() - trialStartTime;
        response.key_char = this.textContent;
    
        console.log('User choice:', response.choice, 'RT:', response.rt);
    
        const chosenSectionRaw = choice;
        const chosenSection = chosenSectionRaw ? chosenSectionRaw.split('-')[0] : null;

        if (chosenSection) {
          highlightChosenSection(chosenSection); // should we also highlight the option (within the section) ?
        }


      // set a timeout to display the feedback after a given delay
      jsPsych.pluginAPI.setTimeout(function() {
        DisplayFeedback();
          // Clear the entire canvas first
          
          ctx.clearRect(0, 0, trial.canvas_dimensions[0], trial.canvas_dimensions[1]);
          
          // update the screen with the click
        
          DrawBackground(isPracticePhase);
          DrawScreen(ctx);

      }, 100);

      },{once: true});
    });

    console.log("CLICK REGISTERED");

  
    function DrawScreen() {

      
      // draw feedback
      if (response.feedback !== undefined && response.feedback !== null) {
        // draw the background
        var feedback_ctx = document.getElementById('feedback-canvas').getContext('2d');
        const pr = window.devicePixelRatio || 1;
        const rect = document.getElementById('feedback-canvas').getBoundingClientRect();
      
        document.getElementById('feedback-canvas').width = rect.width * pr;
        document.getElementById('feedback-canvas').height = rect.height * pr;

        feedback_ctx.scale(pr, pr);

        feedback_ctx.fillStyle = "white";
        feedback_ctx.fillRect(0, 0, trial.feedback_dimensions[0], trial.feedback_dimensions[1]);

        // draw the feedback text
        feedback_ctx.font = "28px Arial";
        feedback_ctx.textAlign = "center";
        var feedback_text = response.feedback;

        if(trial.choice_type == "round" && feedback_text == 'INCORRECT') { // display feedback only in scoring trials (not in prediction trials)
          feedback_ctx.fillStyle = "red";
          feedback_ctx.fillText(feedback_text, 160 + trial.feedback_dimensions[0] / 2 - feedback_ctx.measureText(feedback_text).width, 40 + trial.feedback_dimensions[1] / 2);
        } else if (trial.choice_type == "round" && feedback_text == 'CORRECT'){
          feedback_ctx.fillStyle = "green";
          feedback_ctx.fillText(feedback_text, 130 + trial.feedback_dimensions[0] / 2 - feedback_ctx.measureText(feedback_text).width, 40 + trial.feedback_dimensions[1] / 2);
        }
      }
      

    }; 
    
    
    
    
    

    function DisplayFeedback(){


      // check recorded choice
      // flexible condition
      // acquisition (phase 1)
      if (condition_assignment == 'flex' && isPracticePhase == false && isAcquisition == true && isFinalRound == false && isSeqGen == false) { 
      
      if (counter.round == 1 && response.choice == "Section 1-C" || counter.round == 2 && response.choice == "Section 2-A"
        || counter.round == 3 && response.choice == "Section 3-E" || counter.round == 4 && response.choice == "Section 4-E"
        || counter.round == 5 && response.choice == "Section 5-E" || counter.round == 6 && response.choice == "Section 6-B"
        || counter.round == 7 && response.choice == "Section 1-F" || counter.round == 8 && response.choice == "Section 2-B"
        || counter.round == 9 && response.choice == "Section 3-D" || counter.round == 10 && response.choice == "Section 4-B"
        || counter.round == 11 && response.choice == "Section 5-A" || counter.round == 12 && response.choice == "Section 6-E"

        || counter.round == 13 && response.choice == "Section 1-D" || counter.round == 14 && response.choice == "Section 2-F"
        || counter.round == 15 && response.choice == "Section 3-F" || counter.round == 16 && response.choice == "Section 4-C"
        || counter.round == 17 && response.choice == "Section 5-A" || counter.round == 18 && response.choice == "Section 6-C"
        || counter.round == 19 && response.choice == "Section 1-D" || counter.round == 20 && response.choice == "Section 2-B"
        || counter.round == 21 && response.choice == "Section 3-A" || counter.round == 22 && response.choice == "Section 4-C"
        || counter.round == 23 && response.choice == "Section 5-D" || counter.round == 24 && response.choice == "Section 6-D"
      ){

        response.feedback = 'CORRECT'

      } else {

        response.feedback = 'INCORRECT'

      } 

    } else if (condition_assignment == 'flex' && isPracticePhase == true){
      if (response.choice == "Section 1-C"){

        response.feedback = 'CORRECT'

      } else if (response.choice != "Section 1-C"){

        response.feedback = 'INCORRECT'

      }
    }

    // transfer (phase 2)
    if(condition_assignment == 'flex' && isPracticePhase == false && isAcquisition == false && isFinalRound == false && isSeqGen == false) {

      if ((counter.round == 25 || counter.round == 31 || counter.round == 37 || counter.round == 43) && response.choice == "Section 1-A"){ 

        response.feedback = 'CORRECT'


      } else if ((counter.round == 25 || counter.round == 31 || counter.round == 37 || counter.round == 43) && response.choice != "Section 1-A"){

        response.feedback = 'INCORRECT'
        console.log(response.feedback)


      } else if ((counter.round == 26 || counter.round == 32 || counter.round == 38 || counter.round == 44) && response.choice == "Section 2-B"){

        response.feedback = 'CORRECT'
      

      } else if ((counter.round == 26 || counter.round == 32 || counter.round == 38 || counter.round == 44) && response.choice != "Section 2-B"){

        response.feedback = 'INCORRECT'
      
      }
      
      else if ((counter.round == 27 || counter.round == 33 || counter.round == 39 || counter.round == 45) && response.choice == "Section 3-C"){

        response.feedback = 'CORRECT'

      } else if ((counter.round == 27 || counter.round == 33 || counter.round == 39 || counter.round == 45) && response.choice != "Section 3-C"){

        response.feedback = 'INCORRECT' 

      } 
      
      else if ((counter.round == 28 || counter.round == 34 || counter.round == 40 || counter.round == 46) && response.choice == "Section 4-D"){

        response.feedback = 'CORRECT'

      } else if ((counter.round == 28 || counter.round == 34 || counter.round == 40 || counter.round == 46) && response.choice != "Section 4-D"){

        response.feedback = 'INCORRECT'

      }

      else if ((counter.round == 29 || counter.round == 35 || counter.round == 41 || counter.round == 47) && response.choice == "Section 5-E"){

        response.feedback = 'CORRECT'
        
      } else if ((counter.round == 29 || counter.round == 35 || counter.round == 41 || counter.round == 47) && response.choice != "Section 5-E"){

        response.feedback = 'INCORRECT'
        
      } 
      
      else if ((counter.round == 30 || counter.round == 36 || counter.round == 42 || counter.round == 48) && response.choice == "Section 6-F"){

        response.feedback = 'CORRECT'

      } else if ((counter.round == 30 || counter.round == 36 || counter.round == 42 || counter.round == 48) && response.choice != "Section 6-F"){

        response.feedback = 'INCORRECT'

      }

    }


    // constrained condition
    // acquisition (phase 1)
    
    if (condition_assignment == 'cons' && isPracticePhase == false && isAcquisition == true && isFinalRound == false && isSeqGen == false) {  

      console.log('Choice:', response.choice)
      console.log(response.choice == "Section 1-A")
      console.log(counter.round)

      if ((counter.round == 1 || counter.round == 7 || counter.round == 13 || counter.round == 19) && response.choice == "Section 1-A"){ 

        response.feedback = 'CORRECT'


      } else if ((counter.round == 1 || counter.round == 7 || counter.round == 13 || counter.round == 19) && response.choice != "Section 1-A"){

        response.feedback = 'INCORRECT'
        console.log(response.feedback)


      } else if ((counter.round == 2 || counter.round == 8 || counter.round == 14 || counter.round == 20) && response.choice == "Section 2-B"){

        response.feedback = 'CORRECT'
      

      } else if ((counter.round == 2 || counter.round == 8 || counter.round == 14 || counter.round == 20) && response.choice != "Section 2-B"){

        response.feedback = 'INCORRECT'
      
      }
      
      else if ((counter.round == 3 || counter.round == 9 || counter.round == 15 || counter.round == 21) && response.choice == "Section 3-C"){

        response.feedback = 'CORRECT'

      } else if ((counter.round == 3 || counter.round == 9 || counter.round == 15 || counter.round == 21) && response.choice != "Section 3-C"){

        response.feedback = 'INCORRECT' 

      } 
      
      else if ((counter.round == 4 || counter.round == 10 || counter.round == 16 || counter.round == 22) && response.choice == "Section 4-D"){

        response.feedback = 'CORRECT'

      } else if ((counter.round == 4 || counter.round == 10 || counter.round == 16 || counter.round == 22) && response.choice != "Section 4-D"){

        response.feedback = 'INCORRECT'

      }

      else if ((counter.round == 5 || counter.round == 11 || counter.round == 17 || counter.round == 23) && response.choice == "Section 5-E"){

        response.feedback = 'CORRECT'
        
      } else if ((counter.round == 5 || counter.round == 11 || counter.round == 17 || counter.round == 23) && response.choice != "Section 5-E"){

        response.feedback = 'INCORRECT'
        
      } else if ((counter.round == 6 || counter.round == 12 || counter.round == 18 || counter.round == 24) && response.choice == "Section 6-F"){

        response.feedback = 'CORRECT'

      } else if ((counter.round == 6 || counter.round == 12 || counter.round == 18 || counter.round == 24) && response.choice != "Section 6-F"){

        response.feedback = 'INCORRECT'

      }
    


    } else if (condition_assignment == 'cons' && isPracticePhase == true){
      if (response.choice == "Section 1-C"){

        response.feedback = 'CORRECT'

      } else if (response.choice != "Section 1-C"){

        response.feedback = 'INCORRECT'

      }
    }

    // transfer (phase 2)
    if (condition_assignment == 'cons' && isPracticePhase == false && isAcquisition == false && isFinalRound == false && isSeqGen == false) {

      if (counter.round == 25 && response.choice == "Section 1-C" || counter.round == 26 && response.choice == "Section 2-A"
        || counter.round == 27 && response.choice == "Section 3-E" || counter.round == 28 && response.choice == "Section 4-E"
        || counter.round == 29 && response.choice == "Section 5-E" || counter.round == 30 && response.choice == "Section 6-B"
        || counter.round == 31 && response.choice == "Section 1-F" || counter.round == 32 && response.choice == "Section 2-B"
        || counter.round == 33 && response.choice == "Section 3-D" || counter.round == 34 && response.choice == "Section 4-B"
        || counter.round == 35 && response.choice == "Section 5-A" || counter.round == 36 && response.choice == "Section 6-E"

        || counter.round == 37 && response.choice == "Section 1-D" || counter.round == 38 && response.choice == "Section 2-F"
        || counter.round == 39 && response.choice == "Section 3-F" || counter.round == 40 && response.choice == "Section 4-C"
        || counter.round == 41 && response.choice == "Section 5-A" || counter.round == 42 && response.choice == "Section 6-C"
        || counter.round == 43 && response.choice == "Section 1-D" || counter.round == 44 && response.choice == "Section 2-B"
        || counter.round == 45 && response.choice == "Section 3-A" || counter.round == 46 && response.choice == "Section 4-C"
        || counter.round == 47 && response.choice == "Section 5-D" || counter.round == 48 && response.choice == "Section 6-D"
      ){

        response.feedback = 'CORRECT'

      } else {

        response.feedback = 'INCORRECT'

      } 

    }


    



    if (isFinalRound == true && isAcquisition == false && isPracticePhase == false && isSeqGen == false && trial.choice_type == "round") {
      // final round winner: Section 1-C
      if (response.choice == "Section 1-C"){

        response.feedback = 'CORRECT'

      } else if (response.choice != "Section 1-C"){

        response.feedback = 'INCORRECT'

      } 
    }
    

      // draw the updated stimuli to the screen
      updateScreen();
      //DrawScreen(ctx);

      // set a timeout to end the trial after a given delay
     jsPsych.pluginAPI.setTimeout(function() {
      ITI();
     }, trial.feedback_duration);

    }
    

    
    

    function highlightChosenSection(chosenSection) {
      const sections = document.querySelectorAll('.grid-container .section');
      sections.forEach(section => {
        const sectionLabel = section.querySelector('p strong').textContent.trim();
        if (sectionLabel === chosenSection) {
          section.style.borderColor = '#007bff';  // Bootstrap blue
          section.style.borderWidth = '3px';
          section.style.fontWeight = 'bold';
          section.style.backgroundColor = '#eef7ff'; // subtle blue background highlight if you want
        } else {
          section.style.borderColor = '#888';  // original border color
          section.style.borderWidth = '2px';
          section.style.fontWeight = 'normal';
          section.style.backgroundColor = '#eef1f5'; // original background color
        }
      });
    }


  function ITI() {

  
    // draw the background of the canvas
    jsPsych.pluginAPI.setTimeout(function () {
      // Redraw the screen (or advance to next trial)
      DrawBackground(isPracticePhase);
      DrawScreen(ctx); // if DrawScreen is set to show sections/feedback again
    }, 1000);

    // remove click listeners from choice buttons
    document.querySelectorAll('.choice-btn').forEach(button => {
      button.disabled = true; // prevents further clicks
    });

    // kill any remaining setTimeout handlers
    jsPsych.pluginAPI.clearAllTimeouts();

    // set a timeout to end the ITI after a given delay
      jsPsych.pluginAPI.setTimeout(function() {
      EndTrial();
    }, trial.iti_duration);

  };


  // define correct_option globally
  if (condition_assignment == "flex" && isFinalRound == false) {
    if (counter.round == 26 || counter.round == 32 || counter.round == 38 || counter.round == 44) {
      correct_option = "Section 2-B"
    } else if ([25, 31, 37, 43].includes(counter.round)) {
      correct_option = "Section 1-A"
    } else if ([30, 36, 42, 48].includes(counter.round)) {
      correct_option = "Section 6-F"
    } else if ([29, 35, 41, 47].includes(counter.round)) {
      correct_option = "Section 5-E"
    } else if ([27, 33, 39, 45].includes(counter.round)) {
      correct_option = "Section 3-C"
    } else if ([28, 34, 40, 46].includes(counter.round)) {
      correct_option = "Section 4-D"
    } else if ([1].includes(counter.round)) {
      correct_option = "Section 1-C"
    } else if ([2].includes(counter.round)) {
      correct_option = "Section 2-A"
    } else if ([3].includes(counter.round)) {
      correct_option = "Section 3-E"
    } else if ([4].includes(counter.round)) {
      correct_option = "Section 4-E"
    } else if ([5].includes(counter.round)) {
      correct_option = "Section 5-E"
    } else if ([6].includes(counter.round)) {
      correct_option = "Section 6-B"
    } else if ([7].includes(counter.round)) {
      correct_option = "Section 1-F"
    } else if ([8, 20].includes(counter.round)) {
      correct_option = "Section 2-B"
    } else if ([9].includes(counter.round)) {
      correct_option = "Section 3-D"
    } else if ([10].includes(counter.round)) {
      correct_option = "Section 4-B"
    } else if ([11, 17].includes(counter.round)) {
      correct_option = "Section 5-A"
    } else if ([12].includes(counter.round)) {
      correct_option = "Section 6-E"
    } else if ([13, 19].includes(counter.round)) {
      correct_option = "Section 1-D"
    } else if ([14].includes(counter.round)) {
      correct_option = "Section 2-F"
    } else if ([15].includes(counter.round)) {
      correct_option = "Section 3-F"
    } else if ([16, 22].includes(counter.round)) {
      correct_option = "Section 4-C"
    } else if ([18].includes(counter.round)) {
      correct_option = "Section 6-C"
    } else if ([21].includes(counter.round)) {
      correct_option = "Section 3-A"
    } else if ([23].includes(counter.round)) {
      correct_option = "Section 5-D"
    } else if ([24].includes(counter.round)) {
      correct_option = "Section 6-D"
    }
    
  } else if (condition_assignment == "cons" && isFinalRound == false) { 
    if (counter.round == 1 || counter.round == 7 || counter.round == 13 || counter.round == 19) {
      correct_option = "Section 1-A"
    } else if ([4, 10, 16, 22].includes(counter.round)) {
      correct_option = "Section 4-D"
    } else if ([2, 8, 14, 20].includes(counter.round)) {
      correct_option = "Section 2-B"
    } else if ([5, 11, 17, 23].includes(counter.round)) {
      correct_option = "Section 5-E"
    } else if ([3, 9, 15, 21].includes(counter.round)) {
      correct_option = "Section 3-C"
    } 
    else if ([6].includes(counter.round)) {
      correct_option = "Section 6-F"
    }
    else if ([12].includes(counter.round)) {
      correct_option = "Section 6-F"
    }
    else if ([18].includes(counter.round)) {
      correct_option = "Section 6-F"
    }
    else if ([24].includes(counter.round)) {
      correct_option = "Section 6-F"
    }
    
    /*else if ([6, 12, 18, 24].includes(counter.round)) {
      correct_option = "Section 6-F"
    } */
   
      else if ([25].includes(counter.round)) {
      correct_option = "Section 1-C"
    } else if ([26].includes(counter.round)) {
      correct_option = "Section 2-A"
    } else if ([27].includes(counter.round)) {
      correct_option = "Section 3-E"
    } else if ([28].includes(counter.round)) {
      correct_option = "Section 4-E"
    } else if ([29].includes(counter.round)) {
      correct_option = "Section 5-E"
    } else if ([30].includes(counter.round)) {
      correct_option = "Section 6-B"
    } else if ([31].includes(counter.round)) {
      correct_option = "Section 1-F"
    } else if ([32, 44].includes(counter.round)) {
      correct_option = "Section 2-B"
    } else if ([33].includes(counter.round)) {
      correct_option = "Section 3-D"
    } else if ([34].includes(counter.round)) {
      correct_option = "Section 4-B"
    } else if ([35, 41].includes(counter.round)) {
      correct_option = "Section 5-A"
    } else if ([36].includes(counter.round)) {
      correct_option = "Section 6-E"
    } else if ([37, 43].includes(counter.round)) {
      correct_option = "Section 1-D"
    } else if ([38].includes(counter.round)) {
      correct_option = "Section 2-F"
    } else if ([39].includes(counter.round)) {
      correct_option = "Section 3-F"
    } else if ([40, 46].includes(counter.round)) {
      correct_option = "Section 4-C"
    } else if ([42].includes(counter.round)) {
      correct_option = "Section 6-C"
    } else if ([45].includes(counter.round)) {
      correct_option = "Section 3-A"
    } else if ([47].includes(counter.round)) {
      correct_option = "Section 5-D"
    } else if ([48].includes(counter.round)) {
      correct_option = "Section 6-D"
    }

  } else if (isFinalRound == true) {
    correct_option = "Section 1-C"
  }
  

  

  function EndTrial() {

      console.log('Calling EndTrial', response.feedback);

      // remove click listeners from choice buttons
      document.querySelectorAll('.choice-btn').forEach(button => {
        button.disabled = true; // prevents further clicks
      });

      // kill any remaining setTimeout handlers
      jsPsych.pluginAPI.clearAllTimeouts();


      // gather the data to store for the trial
      var trial_data = {
        'choice_type': trial.choice_type,                  /* type = prediction vs. round */
        'rt': response.rt || null,
        'choice': response.choice || null,
        'feedback': response.feedback || null,
        'section_only': section_only,
        'round': counter.round,
        'correct_option': correct_option,
        'label_mapping': currentShuffledLabels
      };

      console.log(trial_data)
      
      // increment the trial counter
      counter.trial += 1;

      

      console.log("Choice made:", response.choice)
      console.log("Correct option:", correct_option) 
      
      // move on to the next trial
        jsPsych.finishTrial(trial_data);
        
    }; 

  

    } // end plugin.trial
  } SixArmedBanditPlugin.info = info;
return SixArmedBanditPlugin;


  
})(jsPsychModule);



