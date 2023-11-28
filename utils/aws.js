const AWS = require('aws-sdk');
const axios = require('axios');
const config = require('../config/config');

const awsDetailsEndpoint = `${config.STRAPI_URL}/api/ds-viewer-s3-creds?filters[$and][0][creds_id][$eq]=1`;

// Create an S3 instance with custom endpoint configuration
async function getAWSdetails(token) {

    const res = await axios.get(awsDetailsEndpoint, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
    })

    if (config.NODE_ENV === "development") {
        accessKeyId = 'AKIA2W7FWR7CEYPFKKGA'
        secretAccessKey = '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'
        region = 'eu-west-1'
        endpoint = 's3.eu-west-1.amazonaws.com'
        bucketName = 'hexacoder'
    } else {
        accessKeyId = res.data.data[0].attributes.aws_access_key_id
        secretAccessKey = res.data.data[0].attributes.aws_secret_access_key
        region = res.data.data[0].attributes.aws_region
        endpoint = res.data.data[0].attributes.aws_endpoint
        bucketName = res.data.data[0].attributes.aws_bucket
    }

    const s3 = new AWS.S3({
        accessKeyId,
        secretAccessKey,
        region,
        endpoint,
    });

    return { s3, bucketName };
}

module.exports = {
    getAWSdetails
}