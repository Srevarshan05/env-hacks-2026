from decimal import Decimal

import pytest

from app.services import simulator
from app.services.points import points_for, verified_liters_from
from app.services.refills import InvalidTransition, _transition
from tests.conftest import T0


@pytest.mark.parametrize("liters,points", [("1.00", 1), ("1.25", 1), ("1.99", 1), ("2.00", 2), ("10.50", 10), ("0.99", 0)])
def test_points_rule(liters, points):
    assert points_for(Decimal(liters)) == points


def test_verified_liters_truncate_never_round_up():
    assert verified_liters_from(Decimal("1.259")) == Decimal("1.25")
    assert verified_liters_from(Decimal("0.999")) == Decimal("0.99")


def test_simulator_schedule_matches_spec():
    profile = {"start_delay_s": 2, "tick_s": 1, "flow_lps": "0.25", "duration_s": 5}
    readings = simulator.due_readings(profile, T0, None, T0.replace(hour=10))
    assert [(r.seq, r.cumulative_liters) for r in readings] == [
        (0, Decimal("0")), (1, Decimal("0.25")), (2, Decimal("0.50")),
        (3, Decimal("0.75")), (4, Decimal("1.00")), (5, Decimal("1.25")),
    ]
    # Only readings whose time has come, and only after the last stored seq.
    assert [r.seq for r in simulator.due_readings(profile, T0, 1, T0.replace(second=3))] == [2, 3]


def test_terminal_states_cannot_transition():
    class S:
        status = "approved"

    for target in ("approved", "verifying", "failed", "cancelled"):
        with pytest.raises(InvalidTransition):
            _transition(S(), target, T0)
