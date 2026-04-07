# alkibeachvolleyballcalendar
This is a simple project to retrieve data on beach volleyball court bookings at Alki beach in West Seattle and display them in an aggregated fashion so users can quickly see court availbility.

The existing Seattle Parks & Rec website allows you to see court availability for one court at a time, but not in aggregate. Most users don't care about a specific court, they just want to see if there is any court available.

## Sample Curl
```
curl -s "https://anc.apm.activecommunities.com/seattle/rest/reservation/resource/availability/daily/2444?start_date=$(date +%Y-%m-%d)&end_date=$(date -v+6w +%Y-%m-%d)&customer_id=0&company_id=0&event_type_id=-1&attendee=1&no_cache=true&locale=en-US&ui_random=$(date +%s)" \
  -H 'Accept: application/json' \
  -H 'User-Agent: Mozilla/5.0' \
| jq -r '
  .body.details.daily_details[]
  | select(.status == 0)
  | . as $d
  | (["08:00:00"] + ([.times[] | .start_time, .end_time]) + ["21:00:00"])
  | [_nwise(2)]
  | map(select(.[0] < .[1]))
  | if length == 0 then empty
    else "\($d.date):", (.[] | "  BOOKED \(.[0][0:5])-\(.[1][0:5])")
    end
'
```

The above CURL is a sample that retrieves all the current bookins for a court (by resource ID 2444) and formats the output in an easily digestable way, telling us what bookings currently exist. 

The beach volleyball courts are identified by the following resource IDs, seven in total:
2443
2444
2445
2446
2447
2448
2449

Starting with 2443, the courts are given a user friendly name of "Alki Beach Park Volleyball East Court *" where * is the number 1 through 7 (i.e. 2443 is Alki Beach Park Volleyball East Court 01, and 2449 is Alki Beach Park Volleyball East Court 07).

## TODO
We are going to build a new website that displays the court availability in aggregate for all seven courts. A 2 or 3 week look ahead is plenty.

The website should:
* Query the above endpoint for all 7 of the courts.
* Be a single page, nothing extra.
* Display a calendar with the current month. For each day in the calendar, there are 7 circles. Each circle corresponds to one of the courts. If the circle is green, it means the court has no bookings that day. Red indicates a court has a reservation of some sort (any duration). 
* Clicking on a day brings up a modal that has all the detailed information about bookings for each of the 7 courts that day.
* There should be disclaimer text at the bottom of the page that says this site only shows data out for 2 or 3 weeks, and please check https://anc.apm.activecommunities.com/seattle/reservation for confirmation of the data. 
