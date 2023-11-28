require('dotenv').config();

module.exports = {
    STRAPI_URL: process.env.STRAPI_URL || "https://pacs-auth.dent-scan.com",
    NODE_ENV: process.env.NODE_ENV || "production"
};