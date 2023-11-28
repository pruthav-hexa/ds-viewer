// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

$("#doctorSelect").select2({
    width: '70%',
    placeholder: "Select Doctor Name",
    allowClear: true
});

const myButton = document.getElementById('uploadAgain');
myButton.addEventListener('click', function () {
    $("#doctorSelect").val('').trigger('change');
});

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'messageFromPreload') {
        const messageData = event.data.data;
        // Handle the message from the preload script
        let htmlContent = `<div class="systemInfoWrapper">`
        for (const [key, value] of Object.entries(messageData)) {
            htmlContent = htmlContent + `<div> ${key} : <input type="text" readonly value="${value}"/>
            <button data-copyData="${value}"" onclick="copyData(this)">
                <i class="fa fa-clone"></i>
            </button>
            </div>`
        }
        htmlContent = htmlContent + `</div>`
        Swal.fire({
            title: 'Your System information',
            customClass: {
                title: 'custom-title-class',
                confirmButton: 'custom-swal-button'
            },
            html: htmlContent
        })
    }
});


function copyData(element) {
    let copyText = element.parentElement
    let input = copyText.querySelector("input");
    let icon = copyText.querySelector("i");
    input.select();
    document.execCommand("copy");
    icon.classList.add("fa-check");
    icon.classList.remove("fa-clone");
    window.getSelection().removeAllRanges();
    setTimeout(function () {
        icon.classList.add("fa-clone");
        icon.classList.remove("fa-check");
    }, 1000);
}