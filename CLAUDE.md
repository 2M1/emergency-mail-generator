
# Emergency mail creator

## Goal

The goal of this project is to create asimple Javascript website that can be hosted on github pages and generate a a emergency mail conforming PDF file as well as a emergency mail e-mail body string in the right format.

A user should be able to add a location, emergency keyword ("stichwort"), alarm times, alarm number, patient (clear text name) a note ("Hinweis") and corresponding fire and rescue vehicles to an emergency and get a PDf in a what you see is what you get fashion. Thes generated PDF should be downloadable and a text export to send as a mail available.

For further information of how the pdf looks you can check the sampledata/test.pdf fiel and the emergency_mail project available in the same parenfolder as this tool.

Adding dependencies must be compatible with GithubPages hosting!


## Technical implementation

the website should read or through a gitbhub pipeline data about the keywords from a json file `keywords.json` which also includes the standard vehicles for each callout to add per default when selecting this keyword. Selecting the keyword should therefor be one of the first things a user does.

Furthermore there is a `vehicles.json` contianing more detailed information about the vehicles that can be added to the UI.

Note that even thou not displayed in the PDF vehicles have to be present in both the "EMList" mail entry as well as have a row with a potentially custom alarm time in the  ALARM Table of the mail.
Per default the alarmtime of all added vehicles is the alarmtime of the emergency itself.


## UI

The website should permanently show the PDF that can be life edited and have format entry methods in a second smaller column on the right side of the screen. Furthermore a download and download Mail text button should be present in the top right.