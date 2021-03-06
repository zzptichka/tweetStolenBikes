const fs = require("fs")
const fetch = require("node-fetch");
const TwitterApp = require('twitter');
const url = "https://project529.com/garage/bikes/search_results";
const searchPostal = "K2C3K1";  //Exp farm
const searchRadius = 50;        //in km
const searchString = "utf8=%E2%9C%93&search_client=1&include_stolen=true&include_sightings=true&search_external=true&sort=reported_on&is_security=false&organization_id=&serial=&shield=&radius="+searchRadius+"&%5Bradius_units%5D=km&postal_code="+searchPostal+"&%5Bcountry_code%5D=CA&make=&search_form%5Bmanufacturer_id%5D=&search_form%5Bbike_model_id%5D=&search_form%5Bbike_build_id%5D=&model=&%5Bprimary_color%5D=&%5Bbike_type%5D=&full_text=&shielded_only=false&stolen_only=&commit=Search"

require("./auth.js");
const twitter = new TwitterApp(keys);

const getBikesData = async (url, searchStr) => {
    try {
        
        return fetch(url, {
            "headers": {
                "accept": "*/*;q=0.5, text/javascript, application/javascript, application/ecmascript, application/x-ecmascript",
                "accept-language": "en-CA,en-US;q=0.9,en;q=0.8,fr-CA;q=0.7,fr;q=0.6,en-GB;q=0.5",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-csrf-token": "MkZbw+vIe6QXBTUBE3N3i6Ckfqm0LGsaxSPisqMUy/+taRdPX26R/hm1uK2n+qy5oP91LGNFTyyjTcx7ZBKabQ==",
                "x-requested-with": "XMLHttpRequest",
                "cookie": "time_zone=America%2FHavana; time_zone=America%2FHavana; _P529Garage_session=1f537bfe5b0b52e2fea86978b5b9ee5f3; _ga=GA1.2.861639947.1589474587; time_zone=America%2FHavana; _gid=GA1.2.1104248855.1589948978; __unam=b0de3e0-17214362cea-7aac0c2-6"
            },
            "referrer": "https://project529.com/garage/bikes/search",
            "referrerPolicy": "no-referrer-when-downgrade",
            "body": searchStr,
            "method": "POST",
            "mode": "cors"
        })
        .then(reply => {
            return reply.text()
        })
        .then(text => {
            const bikesUrl  = text.match(new RegExp("url: '(.*)',"));
            if(!bikesUrl || bikesUrl.length<1){
                reject(new Error("Bad initial response"));
            }
            return fetch("https://project529.com"+bikesUrl[1]);
        })
        .then(reply => {
            return reply.text();
        })
        .then(text => {
            return JSON.parse(text)
        })
    } catch (error) {
        console.log(error);
    }
};


const getNeighborhood = async (lat, lng) => {
    return fetch("https://nominatim.openstreetmap.org/reverse.php?zoom=18&format=json&accept-language=si&lat="+lat+"&lon="+lng, {"agent": "https://twitter.com/ottbikes"})
    .then(reply => { return reply.text()})
    .then(text => {
        const json = JSON.parse(text);
        if(json["address"]){
            return json["address"]["suburb"]?json["address"]["suburb"]:json["address"]["neighbourhood"];
        }

        return "";
    });
}

function isReportedSince(timeReported, hours){
    const date = Date.parse(timeReported);
    const now = Date.now();
    return now-date < hours*60*60*1000;
}

function formatDate(utc){
    const date = new Date(utc);
    return date.toLocaleString('default', { month: 'long', day: 'numeric' });
}

const downloadFile = (url, path) => new Promise((resolve, reject) => {
    fetch(url)
    .then(response => {
        
        const writeStream = fs.createWriteStream(path);
        response.body.pipe(writeStream);
    
        writeStream.on('error', () => reject('Error writing to file!'));
        writeStream.on('finish', () => writeStream.close(resolve));
    })
    .catch(err => console.error(err));
})

const tweetBike = async (tweet, imageUrl) => {
    downloadFile(imageUrl, 'tmp.jpg')
    .then(_ => {
        const data = fs.readFileSync('tmp.jpg');
        return twitter.post('media/upload', {media: data})
    })
    .then(media => {
        const status = {
            status: tweet,
            media_ids: media.media_id_string // Pass the media id string
          }
        return twitter.post('statuses/update', status);
    })
}

try{
    getBikesData(url, searchString)
    .then(bikes => {
        console.log("Received info on",bikes.length,"bikes");

        for(let bike of bikes)
        {
            if(!isReportedSince(bike.reported_on, 3))
                continue;
            getNeighborhood(bike.incident_lat, bike.incident_lng)
            .then(hood => {
                console.log(bike.title, "last seen on", formatDate(bike.last_seen),"in", hood," More info: ", bike.url);
                const tweet = `${ bike.title } last seen on ${ formatDate(bike.last_seen) } in ${ hood }. More info: ${ bike.url}`;
                return tweetBike(tweet, bike.bolo_medium_image)
            })
            .then(response => {
                console.log("Tweeted:", response);  
            })
            .catch(error =>{ throw error})
        }
    })
    .catch(err => console.error("Failed to get list of bikes", err))
}
catch (error) {
        console.log(error);
    }


