// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const config = require('../config/config');
const fsExtra = require('fs-extra')
const fs = require('fs')
const gltfPipeline = require('gltf-pipeline');
const path = require('path')
const pkg = require('three')
let asyncLoop = require('node-async-loop');
const { getAWSdetails } = require('../utils/aws')
const THREE = pkg
global.THREE = THREE;

const { OBJLoader } = require('../utils/OBJLoader');
const { GLTFExporter } = require('../utils/GLTFExporter');
const { BufferGeometryUtils } = require('../utils/BufferGeometryUtils');

const axios = require('axios');
const { clipboard, ipcRenderer, contextBridge, ipcMain, dialog, app } = require('electron');

const processGltf = gltfPipeline.processGltf;
const gltfToGlb = gltfPipeline.gltfToGlb;

const objLoader = new THREE.OBJLoader()
const gltfExporter = new THREE.GLTFExporter();
let noOfFiles;
let inputFolderPath;
let folderArr
let convertedFiles = 0;
let prcCompleted = false

let percentageCompleted = 0
let percentagePerProcess;
let objFiles
let progress

let isLogin = false;
const strapiUrl = config.STRAPI_URL;
let token = null;
let currentUser = null;


const os = require('os');
const getmac = require('getmac')
const { machineIdSync } = require('node-machine-id');
const deviceId = machineIdSync()
const hostname = os.hostname();
const macId = getmac.default();
let systemAllowed = false

const log = require('electron-log');
let updateAvailableCheck = (config.NODE_ENV === "development")?false:undefined

function logger(level, msg) {
    if (config.NODE_ENV === "development") {
        console[level](msg)
    } else {
        log[level](msg)
    }
}

// contextBridge.exposeInMainWorld(
//     // Allowed 'ipcRenderer' methods
//     'bridge', {
//         // From main to render
//         testFunction: (message) => {
//             console.log("testFunction", message)
//         }
//     }
// );


function checkSystemPermission() {
    logger('info', `System authenticity checking...`)
    systemAllowed = false
    let url = `${strapiUrl}/api/ds-uploader-devices?filters[$and][0][device_id][$eq]=${deviceId}&filters[$and][1][device_hostname][$eq]=${hostname}&filters[$and][2][device_mac][$eq]=${macId}&filters[$and][3][enabled][$eq]=true`
    const headers = {
        'Authorization': `Bearer ${token}`
    };

    return new Promise((resolve, reject) => {
        axios.get(url, { headers })
            .then(response => {
                let details = response.data.data[0]?.attributes
                if (details && details.enabled && details.device_id === deviceId && details.device_hostname === hostname && details.device_mac === macId) {
                    systemAllowed = true
                    logger('info', `System allowed : ${systemAllowed}`)
                    resolve(systemAllowed)
                } else {
                    logger('warn', 'System details not matching with registered details');
                    resolve(systemAllowed)
                }
            })
            .catch(error => {
                logger('error', `Error while getting system details : ${error.message}`);
                resolve(systemAllowed)
            });
    })
}

ipcRenderer.on("message", (event, message) => {
    if (message === 'show-system-details') {
        let data = {
            "Device Id": deviceId,
            "Hostname": hostname,
            "Mac Id": macId,
        }
        window.postMessage({ type: 'messageFromPreload', data: data }, '*');
    }
})

function showAlert(message) {
    ipcRenderer.send("send-alert", message)
}

function addDoctorList() {
    let url = `${strapiUrl}/api/users?page=1&pageSize=10&sort=username:ASC&filters[$and][0][role][name][$eq]=viewer`
    const headers = {
        'Authorization': `Bearer ${token}`
    };

    axios.get(url, { headers })
        .then(response => {
            let doctorSelect = document.getElementById('doctorSelect')
            const option = document.createElement('option');
            option.text = "Select Doctor Name";
            option.value = "";
            doctorSelect.appendChild(option);
            response.data.forEach((doctor, index) => {
                const option = document.createElement('option');
                option.text = doctor.name;
                option.value = doctor.id
                doctorSelect.appendChild(option);
            });
        })
        .catch(error => {
            logger('error', `Error while getting Doctor list : ${error.message}`);
        });
}

window.addEventListener('DOMContentLoaded', () => {

    objFiles = document.getElementById('uploadFolder')
    progress = document.getElementById('progress-done')

    let loginDetails = document.getElementById('loginDetails')
    let mainDetails = document.getElementById('mainDetails')
    let progressBox = document.getElementById('progressDetails')

    if (isLogin) {
        mainDetails.style.display = "flex"
        loginDetails.style.display = "none"
    }

    document.getElementById("login").addEventListener("click", async function () {

        let loginBtn = document.getElementById('login')
        
        let email = document.getElementById('username').value
        let password = document.getElementById('password').value
        
        if (!email || !password) {
            showAlert("Username and Password required")
            logger('warn', `Username and Password required`);
            return
        }
        ipcRenderer.send('check-for-update');

        document.getElementById('loadingLogo').style.display = "block";
        loginBtn.style.display = 'none';

        while (updateAvailableCheck===undefined) {
            await new Promise(resolve => setTimeout(resolve, 100))           
        }
        if(updateAvailableCheck){
            return
        } 

        signIn({ email: email, password: password }).then((data) => {
            token = data.jwt
            checkSystemPermission().then((systemAllowed) => {
                if (systemAllowed) {
                    userRole({ token }).then((data) => {
                        if (data.role.name === "uploader") {
                            addDoctorList();
                            mainDetails.style.display = "flex"
                            loginDetails.style.display = "none"
                            document.getElementById('loadingLogo').style.display = "none";
                            loginBtn.style.display = 'block';
                            currentUser = data.username;
                            isLogin = true
                            logger('info', `Logged in with username ${data.username} and role ${data.role.name}`);
                        } else {
                            resetLoginForm();
                            logger('warn', `This user role is not allowed toy use this application`);
                            showAlert('This user role is not allowed toy use this application')
                        }
                    })
                } else {
                    logger('warn', `This system is not allowed to use this application`);
                    ipcRenderer.send("send-alert", "system-not-allowed")
                }
            })
        }).catch((error) => {
            resetLoginForm();
            logger('warn', `Login failed... : ${error.message}`);
            showAlert(`Login failed...${error.message}`)
        })

    })

    document.getElementById("chooseFile").addEventListener("click", function () {
        let folderSelectLoader = document.getElementById('folderSelectLoader')
        folderSelectLoader.style.display = 'block';
        checkSystemPermission().then((systemAllowed) => {
            if (systemAllowed) {
                folderSelectLoader.style.display = 'none';
                document.getElementById('uploadFolder').click()
            } else {
                folderSelectLoader.style.display = 'none';
                logger('warn', `This system is not allowed to use this application`);
                ipcRenderer.send("send-alert", "system-not-allowed")
            }
        })
    })

    document.getElementById("uploadAnalysisReport").addEventListener("click", function () {
        let analysisFileSelectLoader = document.getElementById('analysisFileSelectLoader')
        analysisFileSelectLoader.style.display = 'block';

        checkSystemPermission().then((systemAllowed) => {
            if (systemAllowed) {
                analysisFileSelectLoader.style.display = 'none';
            } else {
                analysisFileSelectLoader.style.display = 'none';
                logger('warn', `This system is not allowed to use this application`);
                ipcRenderer.send("send-alert", "system-not-allowed")
            }
        })
    })

    document.getElementById("uploadAnalysisReport").addEventListener("change", function (event) {
        let fileInput = event.target;
        let filePath = fileInput.value;
        let allowedExtensions = /(\.pdf)$/i;
     
        if (!allowedExtensions.exec(filePath) && filePath) {
            showAlert("You can only upload PDF files.");
            fileInput.value = '';
            return false;
        }
    });
     
    document.getElementById("iprDataReport").addEventListener("change", function (event) {

        let iprDataSelectLoader = document.getElementById('iprDataSelectLoader')
        iprDataSelectLoader.style.display = 'block';

        checkSystemPermission().then((systemAllowed) => {
            if (systemAllowed) {
                iprDataSelectLoader.style.display = 'none';
            } else {
                iprDataSelectLoader.style.display = 'none';
                logger('warn', `This system is not allowed to use this application`);
                ipcRenderer.send("send-alert", "system-not-allowed")
            }
        })

        let fileInput = event.target;
        let filePath = fileInput.value;
        let allowedExtensions = /(\.json)$/i;
        let file = event.target.files[0];
     
        if (!allowedExtensions.exec(filePath) && filePath) {
            showAlert("You can only upload json files.");
            fileInput.value = null;
            return false;
        }
 
        const reader = new FileReader();
        reader.onload = function (e) {
            const contents = e.target.result;
            try {
                const jsonData = JSON.parse(contents);
                const isFormatCorrect = verifyIPRDataFormat(jsonData);
                if (!isFormatCorrect) {
                    fileInput.value = null;
                    showAlert("Uploaded JSON data doesn't match the required format.");
                    return false;
                }
            } catch (error) {
                showAlert("Error parsing JSON:", error);
                return false;
            }
        };
        reader.readAsText(file);
    });
     

    document.getElementById("uploadAgain").addEventListener("click", function () {
        logger('info', `uploadAgain button clicked`);

        document.getElementById('loadingLogoUploadWrapper').style.display = "flex";
        document.getElementById('generatedLink').style.display = "none";
        document.getElementById('viewerLink').style.display = "none";
        progressBox.style.display = 'none'

        let uploadFolder = document.getElementById('uploadFolder')
        let uploadAnalysisReport = document.getElementById('uploadAnalysisReport')
        let patientName = document.getElementById('patientName')
        let patientId = document.getElementById('patientId')
        // let doctorName = document.getElementById('doctorSelect')
        let doctorId = document.getElementById('doctorSelect')
        let treatmentPlanVersion = document.getElementById('treatmentPlanVersion')
        let upperStepsNumber = document.getElementById('upperStepsNumber')
        let lowerStepsNumber = document.getElementById('lowerStepsNumber')

        let iprData = document.getElementById('iprDataReport')
        let analysisReportLink = document.getElementById('analysisReportLink')
        let comments = document.getElementById('comments')
        let notes = document.getElementById('notes')
        let filePath = document.getElementById('filePath')

        uploadFolder.value = null;
        uploadAnalysisReport.value = null;
        filePath.innerHTML = 'No folder Selected'
        patientName.value = "";
        patientId.value = "";
        // doctorName.value = "";
        doctorId.value = "";
        treatmentPlanVersion.value = "";
        upperStepsNumber.value = "";
        lowerStepsNumber.value = "";
        iprData.value = null;
        analysisReportLink.value = "";
        comments.value = "";
        notes.value = "";

        mainDetails.style.display = 'flex'

    })

    document.getElementById("copyLink").addEventListener("click", function () {
        const copyText = document.getElementById("viewerLink").innerHTML

        clipboard.writeText(copyText);
        logger('info', `Link copied to clipboard: ${copyText}`);
        showAlert("Link copied to clipboard: " + copyText);

    })

    let pathArray = [];

    objFiles.addEventListener('change', (e) => {
        logger('info', `Folder select event triggered`);
        if (objFiles.files.length > 0) {
            let selectedFolder = objFiles.files[0].webkitRelativePath.split('/').shift()

            document.getElementById('filePath').innerHTML = `/${selectedFolder}`

            inputFolderPath = getFolderPath(objFiles.files[0])
            logger('info', `get folder path : ${inputFolderPath}`);

            folderArr = getAllFoldersInFolder(inputFolderPath)
            logger('info', `get sub folder path list : ${folderArr}`);

            pathArray = getFilesPathArray(folderArr)
            logger('info', `get files path array : ${pathArray}`);
        }

    })

    let convertFiles = document.getElementById('upload')
    convertFiles.addEventListener('click', (e) => {
        logger('info',`upload button clicked`)
        checkSystemPermission().then(async(systemAllowed) => {
            if (systemAllowed) {
                let loader = document.getElementById('loadingLogoUploadWrapper')

                if (!folderArr || !folderArr.length) {
                    showAlert("Please select folder which has '.obj' files with predefined structure");
                    return
                }

                let patientName = document.getElementById('patientName').value
                let patientId = document.getElementById('patientId').value
                // let doctorName = document.getElementById('doctorName').value
                let doctorId = document.getElementById('doctorSelect').value
                let treatmentPlanVersion = document.getElementById('treatmentPlanVersion').value
                let upperStepsNumber = document.getElementById('upperStepsNumber').value
                let lowerStepsNumber = document.getElementById('lowerStepsNumber').value

                let iprDataInput = document.getElementById('iprDataReport');
                let iprData = null
                if(iprDataInput.files.length > 0){
                    let iprDataFile = iprDataInput.files[0];
                    const contents = await readJsonFile(iprDataFile)
                    let iprJson = JSON.parse(contents);
                    trimObject(iprJson)
                    iprData = iprJson
                }

                let analysisReportLink = document.getElementById('analysisReportLink').value
                let comments = document.getElementById('comments').value
                let notes = document.getElementById('notes').value

                if (!patientName || !patientId || !doctorId || !treatmentPlanVersion || !upperStepsNumber || !lowerStepsNumber) {
                    showAlert("* fields are required");
                    return
                }

                progressBox.style.display = 'flex'
                mainDetails.style.display = 'none'

                let uploadDetails = {
                    "patient_name": patientName,
                    "patient_id": patientId,
                    "doctor_id": doctorId,
                    // "doctor_name": doctorName,
                    "treatment_plan_version": treatmentPlanVersion,
                    "upper_steps_number": upperStepsNumber,
                    "lower_steps_number": lowerStepsNumber,
                    "ipr_data": iprData,
                    "comments": {},
                    "analysis_report_link": analysisReportLink,
                    "notes": notes,
                    "uploaded_by": currentUser,
                    "link": "",
                }


                if (!pathArray || !pathArray.length) {
                    showAlert("* fields are required");
                    return
                }


                noOfFiles = pathArray.length
                percentagePerProcess = 100 / (noOfFiles * 3)
                convertedFiles = 0
                percentageCompleted = 0
                progress.style.width = '0px'
                progress.style.innerHTML = ''

                progress.parentElement.style.display = 'block'
                const glbFiles = []
                asyncLoop(pathArray, (e, next) => {
                    let fileName = path.basename(e).split('.')[0]
                    logger('info', `converting obj to glb file : ${e}`)
                    fsExtra.readFile(e, 'utf8', (err, data) => {
                        percentageCompleted += percentagePerProcess
                        progress.style.width = Math.round(percentageCompleted) + '%'
                        if (percentageCompleted > 5) {
                            progress.innerHTML = `${Math.round(percentageCompleted)}%`
                        }

                        const obj = objLoader.parse(data);
                        let newObj = new THREE.Object3D();
                        obj.traverse(function (child) {
                            if (child.isMesh) {
                                var newBuffer = THREE.BufferGeometryUtils.mergeVertices(child.geometry)
                                child.geometry = newBuffer;
                                child.geometry.computeBoundingBox();
                            }
                        });
                        percentageCompleted += percentagePerProcess

                        const fileName = e.replace('.obj', '.glb');
                        glbFiles.push(fileName)
                        exportGLTF(obj, fileName, next)
                        logger('info', `conversion obj to glb done for file : ${e}`)

                    })


                }, function (err) {
                    if (err) {
                        logger('error',`${err.message}`)
                        return;
                    }

                    uploadFilesToAwsBucket(folderArr, patientId, treatmentPlanVersion, doctorId).then((res) => {
                        let viewerLink = `https://viewer.dent-scan.com/${patientId}/${treatmentPlanVersion}/${res}`
                        uploadDetails['link'] = viewerLink

                        saveLinkDetails(uploadDetails).then((res) => {
                            document.getElementById("generatedLink").style.display = "flex"
                            document.getElementById("viewerLink").style.display = "block"
                            document.getElementById('viewerLink').innerHTML = viewerLink
                            loader.style.display = 'none'
                            logger('info', `AWS upload done for all files`)
                            showAlert("All files uploaded successfully")
                        }).catch((err) => {
                            logger('error', `error while saving link details : ${err.message}`)
                        })

                    }).catch((err)=>{
                        logger('error', `error while saving file to AWS : ${err.message}`)
                    })


                })
            } else {
                logger('warn', `This system is not allowed to use this app`)
                ipcRenderer.send("send-alert", "system-not-allowed")
            }
        })

    })

    document.getElementById('patientId').addEventListener("change", () => {
        logger('info', `patientId id change event fired`)

        document.getElementById('fieldLoaderId').style.display = 'block';
        let patientId = document.getElementById('patientId').value

        checkSystemPermission().then((systemAllowed) => {
            if (systemAllowed) {
                if (patientId) {
                    getAWSdetails(token).then((data) => {
                        const params = {
                            Bucket: data.bucketName,
                            Delimiter: '/',
                            Prefix: `data/${patientId}/`
                        };

                        data.s3.listObjectsV2(params, function (err, data) {
                            if (err) {
                                logger('error', `error in aws connection while getting list of existing treatmentPlanVersion : ${err.message}`)
                                document.getElementById('fieldLoaderId').style.display = 'none';
                            } else {
                                document.getElementById('treatmentPlanVersion').value = data.CommonPrefixes.length + 1
                                document.getElementById('fieldLoaderId').style.display = 'none';
                            };
                        });

                    }).catch((error) => {
                        logger('error', `error while getting aws connection oject for treatmentPlanVersion : ${error.message}`)
                        showAlert(`Error while getting aws connection oject for treatmentPlanVersion : ${error.message}`);
                    })
                } else {
                    document.getElementById('treatmentPlanVersion').value = ""
                    document.getElementById('fieldLoaderId').style.display = 'none';
                }
            } else {
                logger('error', `This system is not allowed to use this app'`)
                ipcRenderer.send("send-alert", "system-not-allowed")
            }
        })

    });

})

function resetLoginForm() {
    let email = document.getElementById('username')
    let password = document.getElementById('password')
    email.value = "";
    password.value = "";
    password.focus
    document.getElementById('loadingLogo').style.display = "none";
    document.getElementById('login').style.display = 'block';
}

async function signIn({ email, password }) {
    logger('info','trying to login...')
    const res = await axios.post(`${strapiUrl}/api/auth/local`, {
        identifier: email,
        password: password
    })
    return res.data;
}

async function userRole({ token }) {
    const res = await axios.get(`${strapiUrl}/api/users/me?populate=role`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
    })
    return res.data
}

function getFolderPath(inFile) {
    let absPath = inFile.path
    let relativePath = inFile.webkitRelativePath

    relativePath = relativePath.replaceAll("/", "\\")
    let index = relativePath.indexOf('\\')
    let folderName = relativePath.substring(0, index)

    let folderPath = absPath.replace(relativePath, folderName)
    return folderPath
}

function exportGLTF(input, filePath, next) {
    const optionsDraco = {
        dracoOptions: {
            compressionLevel: 6
        }
    };


    const gltfExporter = new THREE.GLTFExporter();
    const options = {
        trs: true,
        onlyVisible: false,
        binary: false,
    };
    gltfExporter.parse(input, function (result) {
        if (result instanceof ArrayBuffer) {
        } else {
            processGltf(result, optionsDraco)
                .then(function (results) {

                    // Convert to glb file using gltfToGlb

                    gltfToGlb(results.gltf).then(function (results) {
                        fsExtra.writeFileSync(filePath, results.glb);
                        percentageCompleted += percentagePerProcess
                        progress.style.width = Math.round(percentageCompleted) + '%'
                        if (percentageCompleted > 5) {
                            progress.innerHTML = `${Math.round(percentageCompleted)}%`
                        }
                        next()
                    });
                });
        }
    }, options);
}

async function saveLinkDetails(uploadDetails) {
    logger('info', `saving link details...`)

    const url = `${strapiUrl}/api/ds-viewer-links`;
    const data = uploadDetails;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    }

    const res = await axios.post(url, { data: data }, { headers })
    return res.data;
}

async function uploadFilesToAwsBucket(inFolderArr, patientId, treatmentPlanVersion, doctorId) {
    let promises = []
    let jsonData = {}
    jsonData.models = []

    for (let index = 0; index < inFolderArr.length; index++) {
        const folderName = inFolderArr[index];

        let mandGlb = path.join(folderName, 'Mandibular.glb')
        let maxGlb = path.join(folderName, 'Maxillary.glb')
        let fileKeyMand = null;
        let fileKeyMax = null;
        // Upload mandibular if exist
        if (fs.existsSync(mandGlb)) {
            let fileNameMand = path.basename(mandGlb)
            let parentFolderNameMand = path.basename(folderName)
            fileKeyMand = `data/${patientId}/${treatmentPlanVersion}/${parentFolderNameMand}/${fileNameMand}`
            promises.push(uploadFileToAWS(mandGlb, fileKeyMand))
        }

        // Upload maxillary if exist
        if (fs.existsSync(maxGlb)) {
            let fileNameMax = path.basename(maxGlb)
            let parentFolderNameMax = path.basename(folderName)
            fileKeyMax = `data/${patientId}/${treatmentPlanVersion}/${parentFolderNameMax}/${fileNameMax}`
            promises.push(uploadFileToAWS(maxGlb, fileKeyMax))
        }

        jsonData.models.push({
            "Mandibular": fileKeyMand,
            "Maxillary": fileKeyMax
        })

    }
    try {
        await Promise.all(promises)
        // Upload json file
        let jsonString = JSON.stringify(jsonData)
        let uuid = generateUUID()
        let jsonFileKey = `data/${patientId}/${treatmentPlanVersion}/${uuid}.json`
        await uploadFileToAWS(jsonString, jsonFileKey, false)
        let analysisReportFile= document.getElementById('uploadAnalysisReport')
        if(analysisReportFile.files.length > 0){
            let filePath= analysisReportFile.files[0].path
            let analysisReportFileKey = `data/${patientId}/${treatmentPlanVersion}/${uuid}.pdf`
            await uploadFileToAWS(filePath, analysisReportFileKey, true)
        }
        return uuid
    } catch (error) {
        showAlert("Error while uploading files")
        return 0
    }
}

function uploadFileToAWS(inData, inKey, isDataPath = true) {

    return new Promise((resolve, reject) => {
        let fileContent
        if (isDataPath) {
            fileContent = fs.readFileSync(inData);
        } else {
            fileContent = inData
        }

        // Setting up S3 upload parameters
        getAWSdetails(token).then((data) => {
            const params = {
                Bucket: data.bucketName,
                Key: inKey,
                Body: fileContent,
            };

            // Uploading files to the bucket
            data.s3.upload(params, (err, data) => {
                if (err) {
                    logger('error', `async upload to AWS failed for file : ${inKey}`)
                    throw err;
                }
                logger('info', `async upload to AWS done for file : ${inData}`)
                resolve()
            });
        }).catch((error) => {
            logger('error', `error creating AWS connection: ${error.message}`)
            showAlert("Error in AWS connection");
        })

    })

}

function getAllFoldersInFolder(inFolderPath) {
    let folders = []
    let files = fs.readdirSync(inFolderPath)
    for (let i = 0; i < files.length; i++) {
        let file = files[i]
        let filePath = path.join(inFolderPath, file)
        let stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
            folders.push(filePath)
        }
    }
    folders.sort((a, b) => {
        let aFolderName = parseInt(path.basename(a))
        let bFolderName = parseInt(path.basename(b))

        return aFolderName - bFolderName
    })
    return folders
}

function getFilesPathArray(inFolderArr) {
    let pathArray = []
    let mandibularCount = 0;
    let maxillaryCount = 0;

    for (let i = 0; i < inFolderArr.length; i++) {
        let folder = inFolderArr[i]

        // Check Mandibular.obj and Maxillary.obj files are present in folder
        let MandiObjPath = path.join(folder, 'Mandibular.obj')
        let MaxiObjPath = path.join(folder, 'Maxillary.obj')
        if (fs.existsSync(MandiObjPath)) {
            pathArray.push(MandiObjPath)
            mandibularCount += 1
        }
        if (fs.existsSync(MaxiObjPath)) {
            pathArray.push(MaxiObjPath)
            maxillaryCount += 1
        }

    }

    document.getElementById('upperStepsNumber').value = maxillaryCount > 0 ? maxillaryCount - 1 : 0
    document.getElementById('lowerStepsNumber').value = mandibularCount > 0 ? mandibularCount - 1 : 0

    return pathArray
}

function generateUUID() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function verifyIPRDataFormat(data) {

    if (!Array.isArray(data)) {
        return false;
    }

    trimObject(data)

    for (const obj of data) {
        if (!obj.hasOwnProperty('step_no') || !obj.hasOwnProperty('location') ||
            !obj.hasOwnProperty('jaw') || !obj.hasOwnProperty('note') ||
            !obj.hasOwnProperty('value')
        ) {
            return false;
        }

        // if (typeof obj.step_no !== 'number') {
        //     return false;
        // }

        if (
            !Array.isArray(obj.location) ||
            obj.location.length !== 3 ||
            !obj.location.every(coord => typeof coord === 'number')
        ) {
            return false;
        }

        // if (typeof obj.jaw !== 'string' || obj.jaw === '') {
        //     return false;
        // }

        // if (typeof obj.note !== 'string' || obj.note === '') {
        //     return false;
        // }

        // if (typeof obj.value !== 'number') {
        //     return false;
        // }
    }

    return true;
}

function trimObject(obj) {
    for (let key in obj) {
        if (typeof obj[key] === 'string') {
            obj[key] = obj[key].trim();
        } else if (typeof obj[key] === 'object') {
            obj[key] = trimObject(obj[key]);
        }
    }
    return obj;
}

function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        reader.onerror = function(e) {
            reject(new Error("Error reading file: " + e.target.error));
        };
        reader.readAsText(file);
    });
 } 

ipcRenderer.on('update-available', (event, info) => {
    logger('info', `update(${info.version}) is available for download`)
    updateAvailableCheck= true
    ipcRenderer.send('show-update-dialog',info.version);
});

ipcRenderer.on('update-not-available', (event, info) => {
    logger('info', `No update is available for download`)
    updateAvailableCheck= false
});

ipcRenderer.on('download-progress', () => {
    let downloadProgressWrapper = document.getElementById('downloadProgressWrapper');
    let loginDiv = document.getElementById('loginDetails');
    downloadProgressWrapper.style.display = 'block';
    loginDiv.style.display = 'none';
});

ipcRenderer.on('app-version', (event, appVersion) => {
    let versionElement = document.getElementById('app-version')
    logger('info',versionElement)
    versionElement.innerText += `(v${appVersion})`;
});

function compareVersions(versionA, versionB) {
    const partsA = versionA.split('.').map(Number);
    const partsB = versionB.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
       const numA = partsA[i] || 0;
       const numB = partsB[i] || 0;
       if (numA < numB) return -1;
       if (numA > numB) return 1;
    }
    return 0; // Versions are equal
}
  