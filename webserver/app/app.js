const express = require('express');
require('log-timestamp')
const path = require('path')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid');
const logger = require('winston')




let config
if (process.env.NODE_ENV === "production") {
    config = require('../config_production.json');
    console.log('Using production config')
} else {
    config = require('../config.json');
    console.log('Using development config')
}




const fs = require('fs');
const FfmpegCommand = require("fluent-ffmpeg");

const app = express();
app.use(cors());

// set upload limit
app.use(express.json({ limit: '999mb' }));

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INDEX_REGEX = /^[a-zA-Z0-9_]+$/;

function isValidUuid(uuid) {
    return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

function isValidIndex(index) {
    return typeof index === 'string' && INDEX_REGEX.test(index);
}

// bind public folder
app.use(express.static('public'))


// bind index.html
app.get('/', (req, res) => {
    res.send();
});



/**
 * POST HTTP method
 * save Recording, timestamps and trial data
 * 
 * For every request a uuid is generated. Then we create a directory with this name and save the recording (audio.mp3) and timestamps (timestamps.txt)
 */
app.post('/save', (req, res) => {
    // Check if everything is present
    if (!req.body.audio) {
        logger.warn('Missing audio')
        res.status(400);
        return res.send('Missing audio');
    }
    if (!req.body.uuid || !isValidUuid(req.body.uuid)) {
        logger.warn('Missing or invalid uuid')
        res.status(400);
        return res.send('Missing or invalid uuid');
    }
    if (!req.body.index || !isValidIndex(req.body.index)) {
        logger.warn('Missing or invalid index')
        res.status(400);
        return res.send('Missing or invalid index');
    }

    const uuid = req.body.uuid;
    const audio_filename = "audio_" + req.body.index + "tmp.wav";

    logger.info('Try to save recording for participant: ' + uuid);
    const buffer = Buffer.from(
        req.body.audio.split('base64,')[1],
        'base64'
    )

    fs.writeFile(path.join(config.PATH_TO_RESSOURCES, uuid, audio_filename), buffer, function (err) {
        if (err) {
            logger.error(err);
            res.status(500);
            return res.send('Failed to save audio');
        }

        convert_audio(path.join(config.PATH_TO_RESSOURCES, uuid, audio_filename));

        logger.info('Recording saved with uuid: ' + uuid + " and index: " + req.body.index);
        res.status(200);
        return res.send({ uuid: uuid });
    })

});

app.post('/createParticipant', (req, res) => {
    const uuid = uuidv4();
    logger.info('Created new participant: ' + uuid);

    fs.mkdirSync(path.join(config.PATH_TO_RESSOURCES, uuid), 0o777);

    return res.status(200).send({ uuid: uuid });
});

app.post('/saveTrialData', (req, res) => {
    if (!req.body.trial_data) {
        logger.warn('Missing trial_data')
        res.status(400);
        return res.send('Missing trial_data');
    }
    if (!req.body.uuid || !isValidUuid(req.body.uuid)) {
        logger.warn('Missing or invalid uuid')
        res.status(400);
        return res.send('Missing or invalid uuid');
    }

    const uuid = req.body.uuid;

    logger.info("Save trial data for participant: " + uuid);
    fs.writeFile(path.join(config.PATH_TO_RESSOURCES, uuid, 'trial_data.csv'), req.body.trial_data, function (err) {
        if (err) {
            logger.error(err);
            res.status(500);
            return res.send('Failed to save trial data');
        }

        res.status(200);
        return res.send({ uuid: uuid });
    })

});

app.delete('/delete', (req, res) => {
    if (!req.body.uuid || !isValidUuid(req.body.uuid)) {
        logger.warn('Missing or invalid uuid')
        res.status(400);
        return res.send('Missing or invalid uuid');
    }

    const uuid = req.body.uuid;
    fs.rmSync(path.join(config.PATH_TO_RESSOURCES, uuid), { recursive: true, force: true });
    res.status(200);

    return res.send({ uuid: uuid });
});

function convert_audio(file) {
    logger.info("Converting file: " + file)
    const new_filename = file.slice(0, -7) + ".wav"
    var outStream = fs.createWriteStream(new_filename);
    var command = new FfmpegCommand();
    command
        .input(file)
        .toFormat("wav")
        .on('error', error => logger.warn(`Encoding Error: ${error.message}`))
        .on('exit', () => logger.info('Audio recorder exited'))
        .on('close', () => logger.info('Audio recorder closed'))
        .on('end', () => {
            logger.info('Audio Transcoding succeeded !' + file)

            // delete tmp.wav
            try {
                fs.unlinkSync(file);
            } catch (error) {
                logger.warn(error)
                console.log(error)
            }
        })
        .pipe(outStream);
}

function listWavFiles(directory) {
    const wavFiles = [];
    const files = fs.readdirSync(directory);

    for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && path.extname(file) === '.wav') {
            wavFiles.push(filePath);
        }
    }

    return wavFiles;
}

module.exports = app; // for testing

