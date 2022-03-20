
class MapConvertor {
    constructor(convertor, points, callback) {
        this.convertor = convertor;
        this.points = points;
        this.callback = callback;
        this.tPoints = [];
    }

    convert() {
        if (this.points.length === 0) {
            return this.callback({status: 0, points: this.tPoints});
        }
        let points = [];
        for (let i=0; i<10 && this.points.length>0; i++) {
            points.push(this.points.shift());
        }
        this.convertor.translate(points, 1, 5, (data) => {
            if (data.status === 0) {
                this.tPoints = this.tPoints.concat(data.points);
                this.convert();
            } else {
                this.callback({status: data.status});
            }
        });
    }
}